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

    /// <summary>Bare hostname of the source, e.g. "github.com"</summary>
    public string? Source { get; set; }
    /// <summary>ISO-8601 publication date of the source article, when it exposes one</summary>
    public string? Published { get; set; }
    /// <summary>Estimated reading time of the source in minutes</summary>
    [DataMember(Name = "reading_time")]
    public int ReadingTime { get; set; }
    /// <summary>Topic labels (release, security, performance, ...) distinct from Technologies</summary>
    public List<string>? Tags { get; set; }
    /// <summary>Audience the content is pitched at: beginner, intermediate or advanced</summary>
    public string? Level { get; set; }
    /// <summary>True when the source is the news itself, false for secondary coverage</summary>
    [DataMember(Name = "primary_source")]
    public bool PrimarySource { get; set; }
    /// <summary>True when the original was walled and the summary came from an archive</summary>
    public bool Paywalled { get; set; }
    [DataMember(Name = "archive_url")]
    public string? ArchiveUrl { get; set; }
    /// <summary>Comments per point. Higher means more contentious.</summary>
    public double Controversy { get; set; }
    /// <summary>Single-label discussion mood: positive, mixed, negative, off_topic, ...</summary>
    public string? Mood { get; set; }
    /// <summary>Confidence in the sentiment analysis: high, medium or low</summary>
    [DataMember(Name = "sentiment_confidence")]
    public string? SentimentConfidence { get; set; }
    /// <summary>Alternatives or prior art that commenters put forward</summary>
    public List<string>? Alternatives { get; set; }
    /// <summary>The same article's discussions on other sites</summary>
    [DataMember(Name = "related_discussions")]
    public List<RelatedDiscussion>? RelatedDiscussions { get; set; }
}

public class RelatedDiscussion
{
    public string? Source { get; set; }
    public string? Url { get; set; }
    public int Points { get; set; }
    public int Comments { get; set; }
    public string? Subreddit { get; set; }
}

public class HackerNewsComment
{
    public long Id { get; set; }
    public string? By { get; set; }
    public string? Text { get; set; }
    public long Time { get; set; }
    public int? Score { get; set; }
    public List<HackerNewsComment>? Children { get; set; }
}
