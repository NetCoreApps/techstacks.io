using ServiceStack;
using System.Collections.Generic;
using System.Runtime.Serialization;
using TechStacks.ServiceModel.Types;

namespace TechStacks.ServiceModel;

[SystemJson(UseSystemJson.Never)]
public class ImportNewsPost : IReturn<CreatePostResponse>
{
    public string Id { get; set; }
    [ValidateNotEmpty]
    public string Title { get; set; }
    public PostType Type { get; set; }
    public List<string>? Technologies { get; set; }
    [DataMember(Name = "relevance_score")]
    public int RelevanceScore { get; set; }
    [ValidateNotEmpty]
    public string Summary { get; set; }
    [ValidateNotEmpty]
    public string Url { get; set; }
    public string? Slug { get; set; }
    public int Points { get; set; }
    public int Comments { get; set; }
    [DataMember(Name = "comments_url")]
    public string? CommentsUrl { get; set; }
    public string? Sentiment { get; set; }
    [DataMember(Name = "top_comment")]
    public HackerNewsComment? TopComment { get; set; }
}

public class HackerNewsComment
{
    public long Id { get; set; }
    public string? By { get; set; }
    public string? Text { get; set; }
    public long Time { get; set; }
    public List<HackerNewsComment>? Children { get; set; }
}
