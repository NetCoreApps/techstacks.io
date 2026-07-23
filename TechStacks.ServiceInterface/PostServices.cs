using System;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ServiceStack;
using ServiceStack.Configuration;
using ServiceStack.OrmLite;
using TechStacks.ServiceModel;
using TechStacks.ServiceModel.Types;

namespace TechStacks.ServiceInterface;

[Authenticate]
public class PostServices(ILogger<PostServices> log, IMarkdownProvider markdown, IConfiguration configuration) : PostServicesBase(markdown)
{
    public class TechnologyResult
    {
        public long Id { get; set; }
        public string Name { get; set; }
        public string Slug { get; set; }
    }

    public async Task<CreatePostResponse> Post(ImportNewsPost request)
    {
        string SanitizeName(string tech) => tech.GenerateSlug()!.Replace("-", "").Trim();

        var allTechnologies = await Db.SelectAsync<TechnologyResult>(Db.From<Technology>());
        var techIds = new List<int>();
        if (request.Technologies != null)
        {
            foreach (var tech in request.Technologies)
            {
                var techLower = tech.ToLower();
                var existingTech = allTechnologies.FirstOrDefault(x => 
                    x.Name.ToLower() == techLower || x.Slug.ToLower() == techLower);

                if (existingTech == null)
                {
                    var techSanitized = SanitizeName(tech);
                    existingTech = allTechnologies.FirstOrDefault(x => SanitizeName(x.Name) == techSanitized);
                }

                if (existingTech != null)
                {
                    techIds.Add((int)existingTech.Id);
                }
            }
        }

        var post = new CreatePost
        {
            OrganizationId = 73,
            Type = request.Type,
            Title = request.Title,
            Url = request.Url,
            Content = request.Summary,
            TechnologyIds = techIds.ToArray(),
            PointsModifier = request.Points > 0 ? request.Points : 1,
            RefId = request.Id,
        };
        if (!string.IsNullOrEmpty(request.CommentsUrl))
        {
            post.RefSource  = request.CommentsUrl.Contains("news.ycombinator.com") 
                ? "HN"
                : request.CommentsUrl.Contains("reddit.com")
                    ? "Reddit"
                    : null;
            if (post.RefSource != null)
            {
                post.RefUrn = $"urn:{post.RefSource.ToLower()}:post:{request.Id}";
            }
        }

        var byline = BuildBylineHtml(request);
        if (byline != null)
            post.Content += $"\n\n{byline}";

        if (request.Sentiment != null)
        {
            post.Content += $"""

                ---
                sentiment from [comments]({request.CommentsUrl}):

                {request.Sentiment}
                """;

            if (request.Alternatives?.Count > 0)
                post.Content += $"\n\n**Alternatives raised in the discussion:** {string.Join(", ", request.Alternatives)}";
        }

        if (request.RelatedDiscussions?.Count > 0)
        {
            var links = request.RelatedDiscussions
                .Where(x => !string.IsNullOrEmpty(x.Url))
                .Select(x => $"[{(!string.IsNullOrEmpty(x.Subreddit) ? x.Subreddit : x.Source)}]({x.Url}) ({x.Points} points, {x.Comments} comments)");
            post.Content += $"\n\n**Also discussed on:** {string.Join(" · ", links)}";
        }

        log.LogInformation("Importing HackerNews post: {Title} with technologies {Technologies}, top comment: {TopComment}", 
            post.Title, string.Join(", ", techIds), request.TopComment?.Text);  
        var ret = await Post(post);

        // Expression trees can't contain null-propagation, so these are hoisted out
        var tags = request.Tags?.ToArray();
        var alternatives = request.Alternatives?.ToArray();
        var published = ParseDate(request.Published);
        var relatedJson = request.RelatedDiscussions?.Count > 0
            ? request.RelatedDiscussions.ToJson()
            : null;

        // Written separately rather than through CreatePost: these are analysis
        // outputs from the import scripts, not fields any user should be able to set.
        await Db.UpdateOnlyAsync(() => new Post
        {
            RelevanceScore = request.RelevanceScore,
            Source = request.Source,
            Published = published,
            ReadingTime = request.ReadingTime,
            Tags = tags,
            Level = request.Level,
            PrimarySource = request.PrimarySource,
            Paywalled = request.Paywalled,
            ArchiveUrl = request.ArchiveUrl,
            Controversy = request.Controversy,
            Mood = request.Mood,
            SentimentConfidence = request.SentimentConfidence,
            Alternatives = alternatives,
            RelatedDiscussions = relatedJson,
        }, where: x => x.Id == ret.Id);

        if (request.TopComment != null)
        {
            await InsertCommentTreeAsync(ret.Id, request.TopComment, replyId: null);
        }
        return ret;
    }

    private static DateTime? ParseDate(string? date) =>
        !string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var parsed)
            ? parsed.ToUniversalTime()
            : null;

    // Small inline SVGs (14px, stroke=currentColor) for the byline meta row. Kept
    // on single lines so the whole byline can be emitted as one raw-HTML block.
    private const string IconGlobe =
        "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0;opacity:.65\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M2 12h20\"/><path d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"/></svg>";
    private const string IconCalendar =
        "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0;opacity:.65\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M16 2v4M8 2v4M3 10h18\"/></svg>";
    private const string IconClock =
        "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0;opacity:.65\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 7v5l3 2\"/></svg>";

    private static string Enc(string s) => WebUtility.HtmlEncode(s);

    /// <summary>
    /// Provenance metadata rendered as a self-contained HTML card rather than inline
    /// markdown, so it reads as post metadata (source, publish date, reading time,
    /// level, tags) and not as body content. Emitted as a single raw-HTML block —
    /// Markdig passes it through untouched — with inline styles only, since the
    /// content is injected via dangerouslySetInnerHTML outside Tailwind's reach.
    /// </summary>
    private static string? BuildBylineHtml(ImportNewsPost request)
    {
        var meta = new List<string>();

        // Source (linked to the article when available) + primary-source badge
        if (!string.IsNullOrEmpty(request.Source))
        {
            var label = !string.IsNullOrEmpty(request.Url)
                ? $"<a href=\"{Enc(request.Url)}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"color:#334155;font-weight:600;text-decoration:none\">{Enc(request.Source)}</a>"
                : $"<span style=\"color:#334155;font-weight:600\">{Enc(request.Source)}</span>";
            var badge = request.PrimarySource
                ? "<span style=\"margin-left:.35rem;padding:.02rem .4rem;border-radius:9999px;background:#ecfdf5;color:#047857;font-size:.66rem;font-weight:600;letter-spacing:.02em\">primary source</span>"
                : "";
            meta.Add($"<span style=\"display:inline-flex;align-items:center;gap:.32rem;white-space:nowrap\">{IconGlobe}{label}{badge}</span>");
        }

        // Parse as UTC so a "…T00:00:00+00:00" date doesn't slip to the previous day
        // when the server is west of UTC.
        if (!string.IsNullOrEmpty(request.Published) &&
            DateTime.TryParse(request.Published, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                out var published))
            meta.Add($"<span style=\"display:inline-flex;align-items:center;gap:.32rem;white-space:nowrap;font-variant-numeric:tabular-nums\">{IconCalendar}{published:MMM d, yyyy}</span>");

        if (request.ReadingTime > 0)
            meta.Add($"<span style=\"display:inline-flex;align-items:center;gap:.32rem;white-space:nowrap\">{IconClock}{request.ReadingTime} min read</span>");

        if (!string.IsNullOrEmpty(request.Level))
        {
            var (bg, fg) = request.Level.ToLower() switch
            {
                "beginner"     => ("#dcfce7", "#166534"),
                "intermediate" => ("#dbeafe", "#1d4ed8"),
                "advanced"     => ("#ede9fe", "#6d28d9"),
                _              => ("#f1f5f9", "#475569"),
            };
            meta.Add($"<span style=\"padding:.05rem .5rem;border-radius:9999px;background:{bg};color:{fg};font-size:.68rem;font-weight:600;text-transform:capitalize;letter-spacing:.02em\">{Enc(request.Level)}</span>");
        }

        if (request.Paywalled)
        {
            var pay = "<span style=\"padding:.05rem .5rem;border-radius:9999px;background:#fef3c7;color:#92400e;font-size:.68rem;font-weight:600\">paywalled</span>";
            if (!string.IsNullOrEmpty(request.ArchiveUrl))
                pay += $"<a href=\"{Enc(request.ArchiveUrl)}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"margin-left:.35rem;color:#92400e;text-decoration:underline;font-size:.72rem\">archived copy</a>";
            meta.Add($"<span style=\"display:inline-flex;align-items:center\">{pay}</span>");
        }

        if (meta.Count == 0 && !(request.Tags?.Count > 0))
            return null;

        var sb = new StringBuilder();
        sb.Append("<div style=\"margin:1.25rem 0;padding:.7rem .9rem;border:1px solid #e2e8f0;border-radius:.6rem;background:#f8fafc;color:#475569;font-size:.8rem;line-height:1.45\">");

        if (meta.Count > 0)
            sb.Append($"<div style=\"display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .95rem\">{string.Concat(meta)}</div>");

        if (request.Tags?.Count > 0)
        {
            sb.Append("<div style=\"display:flex;flex-wrap:wrap;gap:.32rem;margin-top:.55rem\">");
            foreach (var tag in request.Tags)
                sb.Append($"<span style=\"padding:.05rem .5rem;border-radius:9999px;background:#eef2ff;color:#4338ca;font-size:.68rem;font-weight:500\">{Enc(tag)}</span>");
            sb.Append("</div>");
        }

        sb.Append("</div>");
        return sb.ToString();
    }

    private async Task InsertCommentTreeAsync(long postId, HackerNewsComment comment, long? replyId)
    {
        var now = DateTime.Now;
        var created = comment.Time > 0
            ? DateTimeOffset.FromUnixTimeSeconds(comment.Time).DateTime
            : now;
        var postComment = new PostComment
        {
            PostId = postId,
            ReplyId = replyId,
            Content = comment.Text ?? "",
            ContentHtml = Markdown.Transform(comment.Text ?? ""),
            UserId = 2116, // News
            CreatedBy = comment.By ?? "unknown",
            Created = created,
            Modified = created,
            // Reddit gives us the real comment score; HN's API does not expose one
            Score = comment.Score ?? 0,
            UpVotes = comment.Score > 0 ? comment.Score.Value : 0,
            RefId = comment.Id,
            RefSource = "HackerNews",
            RefUrn = $"urn:post:{comment.Id}",
        };
        var commentId = await Db.InsertAsync(postComment, selectIdentity: true);

        if (comment.Children != null)
        {
            foreach (var child in comment.Children)
            {
                await InsertCommentTreeAsync(postId, child, replyId: commentId);
            }
        }
    }

    public async Task<CreatePostResponse> Post(CreatePost request)
    {
        var titleLower = request.Title.ToLower().Replace("-", " ").Replace("_", " ").Replace(".", " ").Trim();
        if ((titleLower.Contains("crypto") && !titleLower.Contains("cryptography") && !titleLower.Contains("cryptographic")) 
            || titleLower.Contains("rummy")
            || titleLower.Contains("1win")
            || titleLower.Contains("ppc")
            || titleLower.Contains("bet365")
            || titleLower.Contains("fantasy sport")
            || titleLower.Contains("wallet")
            || titleLower.Contains("meme coin")
            || titleLower.Contains("defi ")
            || titleLower.Contains("sports book")
            || titleLower.Contains("prediction bot")
            || titleLower.Contains("bot development")
            || titleLower.Contains("trading bots")
            || titleLower.Contains("blockchain")
            || titleLower.Contains("poker") 
            || titleLower.Contains("betting") 
            || titleLower.Contains("cash app") 
            || titleLower.Contains("clone app") 
            || titleLower.Contains("clone script") 
            || titleLower.Contains("clone software") 
            || titleLower.Contains("white label") 
            || titleLower.Contains("marketing services") 
            || titleLower.Contains("fast cash")
            || titleLower.Contains("loan")
            || titleLower.Contains("payday")
            || titleLower.Contains("lucre")
            || titleLower.Contains("gambling")
            || titleLower.Contains("same day")
            || titleLower.Contains("casino"))
        {
            log.LogInformation("Banning post with title: {Title}", request.Title);
            throw new ArgumentException("Crypto, Gaming & other Scam related content is not allowed.", nameof(request.Title));
        }

        var user = GetUser();
        AssertCanPostToOrganization(Db, request.OrganizationId, user, out var org, out var orgMember);
        AssertCanPostTypeToOrganization(request.Type, org, orgMember, user);

        var existingPost = request.Url != null
            ? await Db.SingleAsync<Post>(x => x.Url == request.Url && x.Deleted == null && x.Hidden == null && !x.Archived)
            : null;

        if (existingPost != null)
            throw new ArgumentException($"URL already used in unarchived /posts/{existingPost.Id}/{existingPost.Slug}", nameof(request.Url));
            
        var post = request.ConvertTo<Post>();
        post.Slug = request.Title.GenerateSlug() ?? "";
        post.Created = post.Modified = DateTime.Now;
        post.CreatedBy = post.ModifiedBy = user.UserName;
        post.UserId = user.UserAuthId.ToInt();
        post.UpVotes = 0;
        post.PointsModifier = request.PointsModifier ?? 0;
        post.Points = 1 + post.PointsModifier;
        post.ContentHtml = Markdown.Transform(post.Content);
        post.Rank = 0;

        if (!user.IsOrganizationModerator(orgMember))
        {
            post.Labels = null;
        }

        if (string.IsNullOrEmpty(post.ImageUrl) && Request.Files.Length > 0)
        {
            log.LogInformation("Uploading image to Imgur: {FileName}", Request.Files[0].FileName);
            post.ImageUrl = Request.Files[0].UploadToImgur(configuration["oauth.imgur.ClientId"],
                nameof(post.ImageUrl), minWidth: 200, minHeight: 200, maxWidth: 4000, maxHeight: 4000);                
        }

        var id = await Db.InsertAsync(post, selectIdentity: true);

        await Db.UpdateAddAsync(() => new UserActivity { PostsCount = 1 },
            where: x => x.Id == post.UserId);

        await SendNotificationAsync(nameof(CreatePost), nameof(Post), id);

        ClearPostCaches();

        return new CreatePostResponse
        {
            Id = id,
            Slug = post.Slug,
        };
    }

    public async Task<UpdatePostResponse> Put(UpdatePost request)
    {
        var user = GetUser();
        var post = await AssertPostAsync(request.Id);
        AssertCanPostToOrganization(Db, request.OrganizationId, user, out var org, out var orgMember);
        AssertCanPostTypeToOrganization(request.Type, org, orgMember, user);
        AssertCanUpdatePost(post, user, orgMember);

        if (post.Content != request.Content)
        {
            post.ContentHtml = Markdown.Transform(request.Content);
        }

        if (!user.IsOrganizationModerator(orgMember))
        {
            request.Labels = post.Labels;
        }

        post.PopulateWith(request);
        post.ModifiedBy = user.UserName;
        post.Modified = DateTime.Now;
        post.Rank = 0;

        if (Request.Files.Length > 0)
        {
            log.LogInformation("Uploading image to Imgur: {FileName}", Request.Files[0].FileName);
            post.ImageUrl = Request.Files[0].UploadToImgur(configuration["oauth.imgur.ClientId"],
                nameof(post.ImageUrl), minWidth: 200, minHeight: 200, maxWidth: 4000, maxHeight: 4000);
        }

        await Db.UpdateAsync(post);

        ClearPostCaches();

        return new UpdatePostResponse();
    }

    public object Delete(DeletePost request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));

        var user = GetUser();
        var post = AssertPost(request.Id);
        AssertCanPostToOrganization(Db, post.OrganizationId, user, out var org, out var orgMember);
        AssertCanUpdatePost(post, user, orgMember);

        var userId = user.GetUserId();

        var now = DateTime.Now;
        if (!user.IsOrganizationModerator(orgMember))
        {
            Db.UpdateOnly(() => new Post
                {
                    Deleted = now,
                    DeletedBy = user.UserName,
                    Modified = now,
                },
                where: x => x.Id == request.Id && x.UserId == userId);
        }
        else
        {
            Db.UpdateOnly(() => new Post
                {
                    Deleted = now,
                    DeletedBy = user.UserName,
                    Modified = now,
                },
                where: x => x.Id == request.Id);
        }

        ClearPostCaches();

        return new DeletePostResponse
        {
            Id = request.Id,
        };
    }

    public void Put(LockPost request)
    {
        var user = GetUser();
        var post = AssertPost(request.Id);
        AssertCanPostToOrganization(Db, post.OrganizationId, user, out var org, out var orgMember);

        if (!user.IsOrganizationModerator(orgMember))
            throw HttpError.Forbidden("Access Denied");

        var now = DateTime.Now;
        if (request.Lock)
        {
            post.Locked = now;
            post.LockedBy = user.UserName;
            if (!string.IsNullOrEmpty(request.Reason))
            {
                post.Notes = request.Reason;
            }
        }
        else
        {
            post.Locked = null;
            post.LockedBy = null;
        }

        Db.Update(post);

        Db.Insert(new PostChangeHistory {
            ChangedName = nameof(post.Locked),
            ChangedValue = request.Lock.ToString(),
            ChangedReason = request.Reason,
            Created = now,
            CreatedBy = user.UserName,
        });

        ClearPostCaches();
    }

    public void Put(HidePost request)
    {
        var user = GetUser();
        var post = AssertPost(request.Id);
        AssertCanPostToOrganization(Db, post.OrganizationId, user, out var org, out var orgMember);

        if (!user.IsOrganizationModerator(orgMember))
            throw HttpError.Forbidden("Access Denied");

        var now = DateTime.Now;
        if (request.Hide)
        {
            post.Hidden = now;
            post.HiddenBy = user.UserName;
            if (!string.IsNullOrEmpty(request.Reason))
            {
                post.Notes = request.Reason;
            }
        }
        else
        {
            post.Hidden = null;
            post.HiddenBy = null;
        }

        Db.Update(post);
            
        Db.Insert(new PostChangeHistory {
            ChangedName = nameof(post.Hidden),
            ChangedValue = request.Hide.ToString(),
            ChangedReason = request.Reason,
            Created = now,
            CreatedBy = user.UserName,
        });

        ClearPostCaches();
    }

    public void Put(ChangeStatusPost request)
    {
        var user = GetUser();
        var post = AssertPost(request.Id);
        AssertCanPostToOrganization(Db, post.OrganizationId, user, out var org, out var orgMember);

        if (!user.IsOrganizationModerator(orgMember))
            throw HttpError.Forbidden("Access Denied");

        if (string.IsNullOrEmpty(request.Status))
            throw new ArgumentNullException(nameof(request.Status));
            
        var now = DateTime.Now;
        post.Status = request.Status;
        post.StatusBy = user.UserName;
        post.StatusDate = now;

        Db.Update(post);
            
        Db.Insert(new PostChangeHistory {
            ChangedName = nameof(post.Status),
            ChangedValue = request.Status,
            ChangedReason = request.Reason,
            Created = now,
            CreatedBy = user.UserName,
        });

        ClearPostCaches();
    }

    public void Post(ActionPostReport request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));

        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));

        var user = GetUser();
        var post = AssertPost(request.PostId);

        AssertOrganizationModerator(Db, post.OrganizationId, user, out var org, out var orgMember);

        var now = DateTime.Now;
        if (request.ReportAction == ReportAction.Dismiss)
        {
            Db.UpdateOnly(() => new PostReport { Dismissed = now, DismissedBy = user.UserName },
                where: x => x.OrganizationId == org.Id && x.Id == request.Id && x.PostId == post.Id);
        }
        else if (request.ReportAction == ReportAction.Delete)
        {
            Db.UpdateOnly(() => new Post { Deleted = now, DeletedBy = user.UserName },
                where: x => x.OrganizationId == org.Id && x.Id == post.Id);

            Db.UpdateOnly(() => new PostReport { Acknowledged = now, AcknowledgedBy = user.UserName },
                where: x => x.OrganizationId == org.Id && x.Id == request.Id && x.PostId == post.Id);
        }

        ClearPostCaches();
    }

    public async Task<CreatePostCommentResponse> Post(CreatePostComment request)
    {
        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));
        if (string.IsNullOrEmpty(request.Content))
            throw new ArgumentNullException(nameof(request.Content));

        var user = GetUser();
        var post = await AssertPostAsync(request.PostId);
        var groupMember = AssertCanCommentToOrganization(Db, post.OrganizationId, user);
        AssertCanContributeToPost(post, user, groupMember);

        var userId = user.GetRequiredUserId();
        var comment = request.ConvertTo<PostComment>();
        comment.UserId = userId;
        comment.CreatedBy = user.UserName;
        comment.Created = comment.Modified = DateTime.Now;
        comment.ContentHtml = Markdown.Transform(comment.Content);
        comment.UpVotes = 0;

        var id = await Db.InsertAsync(comment, selectIdentity: true);

        var now = DateTime.Now;

        await Db.UpdateAddAsync(() => new UserActivity { Modified = now, PostCommentsCount = 1 },
            where: x => x.Id == comment.UserId);

        await Db.UpdateOnlyAsync(() =>
                new Post { LastCommentDate = now, LastCommentId = id, LastCommentUserId = userId },
            where: x => x.Id == request.PostId);

        ClearPostCaches();

        return new CreatePostCommentResponse
        {
            Id = id,
            PostId = comment.PostId,
        };
    }

    public async Task<UpdatePostCommentResponse> Put(UpdatePostComment request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));
        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));
        if (string.IsNullOrEmpty(request.Content))
            throw new ArgumentNullException(nameof(request.Content));

        var user = GetUser();
        var post = await AssertPostAsync(request.PostId);
        var groupMember = AssertCanCommentToOrganization(Db, post.OrganizationId, user);
        AssertCanContributeToPost(post, user, groupMember);

        var userId = user.GetUserId();

        var html = Markdown.Transform(request.Content);
        var rowsUpdated = !user.IsAdmin()
            ? await Db.UpdateOnlyAsync(() => new PostComment {
                    Content = request.Content,
                    ContentHtml = html,
                    Modified = DateTime.Now,
                },
                where: x => x.Id == request.Id && x.PostId == request.PostId && x.UserId == userId)
            : await Db.UpdateOnlyAsync(() => new PostComment
                {
                    Content = request.Content,
                    ContentHtml = html,
                    Modified = DateTime.Now,
                },
                where: x => x.Id == request.Id);

        if (rowsUpdated == 0)
            throw HttpError.NotFound("Comment does not exist");

        var now = DateTime.Now;
        await Db.UpdateOnlyAsync(() =>
                new Post { LastCommentDate = now, LastCommentId = request.Id, LastCommentUserId = userId },
            where: x => x.Id == request.PostId);

        ClearPostCaches();

        return new UpdatePostCommentResponse();
    }

    public object Delete(DeletePostComment request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));
        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));

        var user = GetUser();
        var post = AssertPost(request.PostId);
        var groupMember = AssertCanCommentToOrganization(Db, post.OrganizationId, user);
        AssertCanContributeToPost(post, user, groupMember);

        var now = DateTime.Now;
        var userId = user.GetUserId();

        if (!user.IsOrganizationModerator(groupMember))
        {
            Db.UpdateOnly(() => new PostComment
                {
                    Deleted = now,
                    DeletedBy = user.UserName,
                    Modified = now,                        
                }, 
                where: x => x.Id == request.Id && x.PostId == request.PostId && x.UserId == userId);
        }
        else
        {
            Db.UpdateOnly(() => new PostComment
                {
                    Deleted = now,
                    DeletedBy = user.UserName,
                    Modified = now,
                },
                where: x => x.Id == request.Id && x.PostId == request.PostId);
        }

        ClearPostCaches();

        return new DeletePostCommentResponse
        {
            Id = request.Id,
            PostId = request.PostId
        };
    }

    public void Post(ActionPostCommentReport request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));

        if (request.PostCommentId <= 0)
            throw new ArgumentNullException(nameof(request.PostCommentId));

        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));

        var comment = AssertPostComment(request.PostCommentId);

        if (comment.PostId != request.PostId)
            throw new ArgumentException("Invalid PostId", nameof(request.PostId));

        var user = GetUser();
        var post = AssertPost(comment.PostId);
        AssertOrganizationModerator(Db, post.OrganizationId, user, out var org, out var orgMember);

        var now = DateTime.Now;
        if (request.ReportAction == ReportAction.Dismiss)
        {
            Db.UpdateOnly(() => new PostCommentReport { Dismissed = now, DismissedBy = user.UserName },
                where: x => x.OrganizationId == org.Id && x.Id == request.Id && x.PostCommentId == request.PostCommentId);
        }
        else if (request.ReportAction == ReportAction.Delete)
        {
            Db.UpdateOnly(() => new PostComment { Deleted = now, DeletedBy = user.UserName },
                where: x => x.PostId == post.Id && x.Id == request.PostCommentId);

            Db.UpdateOnly(() => new PostCommentReport { Acknowledged = now, AcknowledgedBy = user.UserName },
                where: x => x.OrganizationId == org.Id && x.Id == request.Id && x.PostCommentId == request.PostCommentId);
        }

        ClearPostCaches();
    }

    public object Get(GetUserPostCommentVotes request)
    {
        var userId = GetUserId();

        var q = Db.From<PostCommentVote>()
            .Where(x => x.UserId == userId && x.PostId == request.PostId)
            .Select(x => new { x.PostCommentId, x.Weight });

        var commentVotes = Db.Select<(long commentId, int weight)>(q);

        return new GetUserPostCommentVotesResponse
        {
            PostId = request.PostId,
            UpVotedCommentIds = commentVotes.Where(x => x.weight > 0).Map(x => x.commentId),
            DownVotedCommentIds = commentVotes.Where(x => x.weight < 0).Map(x => x.commentId),
        };
    }

    public object Put(PinPostComment request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));
        if (request.PostId <= 0)
            throw new ArgumentNullException(nameof(request.PostId));

        var user = GetUser();
        var post = AssertPost(request.PostId);
        AssertCanPostToOrganization(Db, post.OrganizationId, user, out var org, out var orgMember);
        AssertCanContributeToPost(post, user, orgMember);

        if (post.UserId != user.GetUserId() && !user.IsOrganizationModerator(orgMember))
            throw HttpError.Forbidden("Only Post author can pin comments");

        Db.UpdateOnly(() => new Post
            {
                PinCommentId = request.Pin ? request.Id : (long?)null,
                Modified = DateTime.Now,
                ModifiedBy = user.UserName
            },
            where: x => x.Id == request.PostId);

        Db.ExecuteSql(
            @"update user_activity set 
                         pinned_comment_count = (select count(*) 
                                                   from post p 
                                                   join post_comment c on (p.pin_comment_id = c.id and p.user_id <> user_activity.id)
                                                  where c.user_id = user_activity.id)
                   where id = (select user_id from post_comment c where c.id = @id)",
            new { id = request.Id });

        ClearPostCaches();

        return new PinPostCommentResponse();
    }
}