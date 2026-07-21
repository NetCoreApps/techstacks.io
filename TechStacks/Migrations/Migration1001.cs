using ServiceStack.DataAnnotations;
using ServiceStack.OrmLite;

namespace TechStacks.Migrations;

/// <summary>
/// Adds the news analysis metadata produced by the HN/Reddit scanning scripts
/// (scripts/analyze_tech_article.py and analyze_*_comments.py) to Post.
///
/// These were previously either discarded on import or flattened into the post's
/// markdown Content, which made them impossible to rank, filter or facet on.
/// </summary>
public class Migration1001 : MigrationBase
{
    public class Post
    {
        /// <summary>0-100, how useful the article is to a working developer.</summary>
        [Index]
        [Default(0)]
        public int RelevanceScore { get; set; }

        /// <summary>Bare hostname of the source, e.g. "blog.rust-lang.org".</summary>
        public string? Source { get; set; }

        /// <summary>
        /// Publication date of the source article. Distinct from Created: HN and
        /// Reddit routinely resurface years-old articles.
        /// </summary>
        public DateTime? Published { get; set; }

        /// <summary>Estimated reading time of the source in minutes.</summary>
        [Default(0)]
        public int ReadingTime { get; set; }

        /// <summary>Topic labels (release, security, performance, ...).</summary>
        [PgSqlTextArray]
        public string[]? Tags { get; set; }

        /// <summary>Audience: beginner, intermediate or advanced.</summary>
        public string? Level { get; set; }

        /// <summary>True when the source is the news itself, not secondary coverage.</summary>
        [Default(typeof(bool), "false")]
        public bool PrimarySource { get; set; }

        /// <summary>True when the original was walled and the summary came from an archive.</summary>
        [Default(typeof(bool), "false")]
        public bool Paywalled { get; set; }

        public string? ArchiveUrl { get; set; }

        /// <summary>Comments per point. Higher means more contentious.</summary>
        [Default(0)]
        public double Controversy { get; set; }

        /// <summary>Discussion mood: positive, mostly_positive, mixed, mostly_negative, negative, off_topic.</summary>
        [Index]
        public string? Mood { get; set; }

        /// <summary>Confidence in the sentiment analysis: high, medium or low.</summary>
        public string? SentimentConfidence { get; set; }

        /// <summary>Alternatives or prior art that commenters put forward.</summary>
        [PgSqlTextArray]
        public string[]? Alternatives { get; set; }

        /// <summary>The same article's discussions on other sites, as JSON.</summary>
        [PgSqlJsonB]
        public string? RelatedDiscussions { get; set; }
    }

    public override void Up()
    {
        Db.AddColumn<Post>(x => x.RelevanceScore);
        Db.AddColumn<Post>(x => x.Source);
        Db.AddColumn<Post>(x => x.Published);
        Db.AddColumn<Post>(x => x.ReadingTime);
        Db.AddColumn<Post>(x => x.Tags);
        Db.AddColumn<Post>(x => x.Level);
        Db.AddColumn<Post>(x => x.PrimarySource);
        Db.AddColumn<Post>(x => x.Paywalled);
        Db.AddColumn<Post>(x => x.ArchiveUrl);
        Db.AddColumn<Post>(x => x.Controversy);
        Db.AddColumn<Post>(x => x.Mood);
        Db.AddColumn<Post>(x => x.SentimentConfidence);
        Db.AddColumn<Post>(x => x.Alternatives);
        Db.AddColumn<Post>(x => x.RelatedDiscussions);
    }

    public override void Down()
    {
        Db.DropColumn<Post>(x => x.RelevanceScore);
        Db.DropColumn<Post>(x => x.Source);
        Db.DropColumn<Post>(x => x.Published);
        Db.DropColumn<Post>(x => x.ReadingTime);
        Db.DropColumn<Post>(x => x.Tags);
        Db.DropColumn<Post>(x => x.Level);
        Db.DropColumn<Post>(x => x.PrimarySource);
        Db.DropColumn<Post>(x => x.Paywalled);
        Db.DropColumn<Post>(x => x.ArchiveUrl);
        Db.DropColumn<Post>(x => x.Controversy);
        Db.DropColumn<Post>(x => x.Mood);
        Db.DropColumn<Post>(x => x.SentimentConfidence);
        Db.DropColumn<Post>(x => x.Alternatives);
        Db.DropColumn<Post>(x => x.RelatedDiscussions);
    }
}
