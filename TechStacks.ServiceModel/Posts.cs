using System;
using System.Collections.Generic;
using System.Runtime.Serialization;
using ServiceStack;
using ServiceStack.DataAnnotations;
using TechStacks.ServiceModel.Types;

namespace TechStacks.ServiceModel;

[Tag(Tags.AutoQuery), Tag(Tags.Posts)]
public partial class QueryPosts : QueryDb<Post>
{
    public virtual int[]? Ids { get; set; }
    public virtual int? OrganizationId { get; set; }
    public virtual List<int>? OrganizationIds { get; set; }
    public virtual HashSet<string>? Types { get; set; }
    public virtual HashSet<int>? AnyTechnologyIds { get; set; }
    public virtual string[]? Is { get; set; }
    public int? UserId { get; set; }
}

[Tag(Tags.AutoQuery), Tag(Tags.Posts)]
public class QueryPostComments : QueryDb<PostComment>
{
    public long? Id { get; set; }
    public long? UserId { get; set; }
    public long? PostId { get; set; }
    public string ContentContains { get; set; }
    public long? UpVotesAbove { get; set; }
    public long? UpVotesBelow { get; set; }
    public long? DownVotesAbove { get; set; }
    public long? DownVotes { get; set; }
    public long? FavoritesAbove { get; set; }
    public long? FavoritesBelow { get; set; }
    public int? WordCountAbove { get; set; }
    public int? WordCountBelow { get; set; }
    public int? ReportCountAbove { get; set; }
    public int? ReportCountBelow { get; set; }
}

[Tag(Tags.Posts)]
public class CreatePost : IReturn<CreatePostResponse>, IPost
{
    public int OrganizationId { get; set; }

    public PostType Type { get; set; }

    public int CategoryId { get; set; }

    [ValidateNotEmpty]
    public string Title { get; set; }

    [Index]
    public string Url { get; set; }

    public string ImageUrl { get; set; }

    public string Content { get; set; }

    public bool? Lock { get; set; }

    public int[] TechnologyIds { get; set; }

    public string[] Labels { get; set; }

    public DateTime? FromDate { get; set; }

    public DateTime? ToDate { get; set; }

    public string MetaType { get; set; }

    public string Meta { get; set; }

    public long? RefId { get; set; }
    public string? RefSource { get; set; }
    public string? RefUrn { get; set; }

    [IgnoreDataMember]
    public int? PointsModifier { get; set; }
}

public class CreatePostResponse
{
    public long Id { get; set; }
    public string Slug { get; set; }

    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class UpdatePost : IReturn<UpdatePostResponse>, IPut
{
    public long Id { get; set; }

    public int OrganizationId { get; set; }

    public PostType Type { get; set; }

    public int CategoryId { get; set; }

    public string Title { get; set; }

    public string Url { get; set; }

    public string ImageUrl { get; set; }

    public string Content { get; set; }

    public bool? Lock { get; set; }

    public int[] TechnologyIds { get; set; }

    public string[] Labels { get; set; }

    public DateTime? FromDate { get; set; }

    public DateTime? ToDate { get; set; }

    public string MetaType { get; set; }

    public string Meta { get; set; }
}

public class UpdatePostResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class DeletePost : IReturn<DeletePostResponse>, IDelete
{
    public long Id { get; set; }
}

public class DeletePostResponse
{
    public long Id { get; set; }
    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class LockPost : IReturnVoid, IPut
{
    public long Id { get; set; }
    public bool Lock { get; set; }
    public string Reason { get; set; }
}

[Tag(Tags.Posts)]
public class HidePost : IReturnVoid, IPut
{
    public long Id { get; set; }
    public bool Hide { get; set; }
    public string Reason { get; set; }
}

[Tag(Tags.Posts)]
public class ChangeStatusPost : IReturnVoid, IPut
{
    public long Id { get; set; }
    public string Status { get; set; }
    public string Reason { get; set; }
}

[Tag(Tags.Posts)]
public class GetUserPostActivity : IGet, IReturn<GetUserPostActivityResponse> {}

public class GetUserPostActivityResponse
{
    public List<long> UpVotedPostIds { get; set; }
    public List<long> DownVotedPostIds { get; set; }

    public List<long> FavoritePostIds { get; set; }

    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class GetUserOrganizations : IGet, IReturn<GetUserOrganizationsResponse> { }

public class GetUserOrganizationsResponse
{
    public List<OrganizationMember> Members { get; set; }
    public List<OrganizationMemberInvite> MemberInvites { get; set; }
    public List<OrganizationSubscription> Subscriptions { get; set; } 
}

[Tag(Tags.Posts)]
public class UserPostVote : IPut, IReturn<UserPostVoteResponse>
{
    public long Id { get; set; }
    public int Weight { get; set; }
}

public class UserPostVoteResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class UserPostFavorite : IPut, IReturn<UserPostFavoriteResponse>
{
    public long Id { get; set; }
}

public class UserPostFavoriteResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class UserPostReport : IPut, IReturn<UserPostReportResponse>
{
    public long Id { get; set; }
    public FlagType FlagType { get; set; }
    public string ReportNotes { get; set; }
}

public class UserPostReportResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

public enum ReportAction
{
    Dismiss,
    Delete,
}

[Tag(Tags.Posts)]
public class ActionPostReport : IPost, IReturnVoid
{
    public long PostId { get; set; }
    public long Id { get; set; }
    public ReportAction ReportAction { get; set; }
}

[Tag(Tags.Posts)]
public class GetPost : IGet, IReturn<GetPostResponse>
{
    public long Id { get; set; }
    public string Include { get; set; }
}

public class GetPostResponse
{
    public long Cache { get; set; }

    public Post Post { get; set; }

    public List<PostComment> Comments { get; set; }

    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class CreatePostComment : IPost, IReturn<CreatePostCommentResponse>
{
    public long PostId { get; set; }

    public long? ReplyId { get; set; }

    public string Content { get; set; }
}

public class CreatePostCommentResponse
{
    public long Id { get; set; }
    public long PostId { get; set; }

    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class UpdatePostComment : IPut, IReturn<UpdatePostCommentResponse>
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public string Content { get; set; }
}

public class UpdatePostCommentResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

[Tag(Tags.Posts)]
public class DeletePostComment : IDelete, IReturn<DeletePostCommentResponse>
{
    public long Id { get; set; }
    public long PostId { get; set; }
}

public class DeletePostCommentResponse
{
    public long Id { get; set; }
    public long PostId { get; set; }

    public ResponseStatus ResponseStatus { get; set; }
}

public class UserPostCommentVote : IPut, IReturn<UserPostCommentVoteResponse>
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public int Weight { get; set; }
}

public class UserPostCommentVoteResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

public class UserPostCommentReport : IPut, IReturn<UserPostCommentReportResponse>
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public FlagType FlagType { get; set; }
    public string ReportNotes { get; set; }
}

public class UserPostCommentReportResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}

public class ActionPostCommentReport : IPost, IReturnVoid
{
    public long Id { get; set; }
    public long PostCommentId { get; set; }
    public long PostId { get; set; }
    public ReportAction ReportAction { get; set; }
}

[Tag(Tags.Posts)]
public class GetUserPostCommentVotes : IGet, IReturn<GetUserPostCommentVotesResponse>
{
    public long PostId { get; set; }
}

public class GetUserPostCommentVotesResponse
{
    public long PostId { get; set; }
    public List<long> UpVotedCommentIds { get; set; }
    public List<long> DownVotedCommentIds { get; set; }
}

public class PinPostComment : IPut, IReturn<PinPostCommentResponse>
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public bool Pin { get; set; }
}

public class PinPostCommentResponse
{
    public ResponseStatus ResponseStatus { get; set; }
}