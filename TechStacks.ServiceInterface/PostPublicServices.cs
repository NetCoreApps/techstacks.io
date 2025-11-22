using System;
using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using ServiceStack;
using ServiceStack.OrmLite;
using TechStacks.Data;
using TechStacks.ServiceModel;
using TechStacks.ServiceModel.Types;

namespace TechStacks.ServiceInterface;

public class PostPublicServices(IMarkdownProvider markdown, IAutoQueryDb autoQuery) : PostServicesBase(markdown)
{
    public async Task<object> Any(QueryPosts request)
    {
        var q = autoQuery.CreateQuery(request, Request.GetRequestParams());
        q.Where(x => x.Deleted == null);
            
        var states = request.Is ?? [];
        if (states.Contains("closed") || states.Contains("completed") || states.Contains("declined"))
            q.And(x => x.Status == "closed");
        else
            q.And(x => x.Hidden == null && (x.Status == null || x.Status != "closed"));

        if (states.Length > 0)
        {
            var labelSlugs = states.Where(x => x != "closed" && x != "open")
                .Map(x => x.GenerateSlug());
            if (labelSlugs.Count > 0)
                q.And($"ARRAY[{new SqlInValues(labelSlugs).ToSqlInString()}] && labels");
        }

        if (!request.AnyTechnologyIds.IsEmpty())
        {
            var techIds = request.AnyTechnologyIds.Join(",");
            var orgIds = request.AnyTechnologyIds.Map(id => GetOrganizationByTechnologyId(Db, id))
                .Where(x => x != null)
                .Select(x => x.Id)
                .Join(",");
            if (string.IsNullOrEmpty(orgIds))
                orgIds = "NULL";

            q.And($"(ARRAY[{techIds}] && technology_ids OR organization_id in ({orgIds}))");
        }

        var results = await autoQuery.ExecuteAsync(request, q);

        var userIds = results.Results.Map(x => x.UserId).Distinct().ToList();
        if (userIds.Count > 0)
        {
            var users = await Db.GetUserProfilesMapAsync(userIds);
            results.Results.Each(x => x.UserProfileUrl = users.GetProfileUrl(x.UserId));
        }

        return results;
    }

    public async Task<GetPostResponse> Get(GetPost request)
    {
        if (request.Id <= 0)
            throw new ArgumentNullException(nameof(request.Id));

        var user = SessionAs<AuthUserSession>()!;
        var post = await Db.SingleByIdAsync<Post>(request.Id);
        OrganizationMember? groupMember = null;
        if (post != null)
            AssertCanViewOrganization(Db, post.OrganizationId, user, out _, out groupMember);

        if (post == null || post.Deleted != null && !user.IsOrganizationModerator(groupMember))
            throw HttpError.NotFound("Post does not exist");

        var postComments = request.Include == "comments"
            ? await Db.SelectAsync<PostComment>(x => x.PostId == request.Id && x.Deleted == null)
            : TypeConstants<PostComment>.EmptyList;

        // Get unique userIds from post and comments
        var userIds = postComments.Map(x => x.UserId).Distinct().ToList();
        var users = await Db.GetUserProfilesMapAsync(userIds);

        post.UserProfileUrl = users.GetProfileUrl(post.UserId);
        postComments.Each(x => x.UserProfileUrl = users.GetProfileUrl(x.UserId));

        return new GetPostResponse
        {
            Cache = Stopwatch.GetTimestamp(),
            Post = post,
            Comments = postComments,
        };
    }
}

public static class PostExtensions
{
    public static ConcurrentDictionary<int,string> UserProfilesCache { get; } = new();

    public static async Task<Dictionary<int, string>> GetUserProfilesMapAsync(this IDbConnection db, List<int> userIds)
    {
        if (userIds.Count == 0)
            return new();
        var to = new Dictionary<int, string>();
        foreach (var userId in userIds)
        {
            if (UserProfilesCache.TryGetValue(userId, out var avatarUrl))
                to[userId] = avatarUrl;
        }

        var remainingUserIds = userIds.Where(x => !to.ContainsKey(x)).ToList();

        var remainingUsers = await db.SelectAsync<(int id, string? profileUrl, string userName)>(
            db.From<ApplicationUser>()
            .Where(x => remainingUserIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ProfileUrl, x.UserName }));

        foreach (var user in remainingUsers)
        {
            var profileUrl = user.profileUrl 
                ?? SvgCreator.CreateSvgDataUri(char.ToUpper(user.userName[0]), 
                    bgColor:SvgCreator.GetDarkColor(user.id));
            UserProfilesCache[user.id] = profileUrl;
            to[user.id] = profileUrl;
        }

        return to;
    }

    public static string GetProfileUrl(this Dictionary<int, string> users, int? userId) =>
        (userId != null && users.TryGetValue(userId.Value, out var avatarUrl)
            ? avatarUrl
            : null)
            ?? SvgCreator.CreateSvgDataUri('A', 
                bgColor:SvgCreator.GetDarkColor(userId ?? 0));
}