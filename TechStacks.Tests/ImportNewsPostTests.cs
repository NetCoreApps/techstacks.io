using NUnit.Framework;
using ServiceStack;
using ServiceStack.Logging;
using ServiceStack.OrmLite;
using ServiceStack.Text;
using TechStacks.ServiceModel;
using TechStacks.ServiceModel.Types;

namespace TechStacks.Tests;

public class ImportNewsPostTests : DbTasksBase
{
    static ImportNewsPostTests() => LogManager.LogFactory = new ConsoleLogFactory(debugEnabled: true);

    string PostJson = """
    {
        "title": "Text classification with Python 3.14's ZSTD module",
        "type": "Post",
        "technologies": [
            "Python",
            "Zstandard",
            "scikit-learn"
        ],
        "relevance_score": 95,
        "summary": "Python 3.14's new `compression.zstd` module enables a novel parameter-free text classification approach using incremental compression. The technique leverages the principle that compression length approximates Kolmogorov complexity\u2014text similar to training data compresses better.\n\n**Key Implementation Details:**\n- Uses `ZstdCompressor` with `ZstdDict` for pre-trained dictionaries per class\n- Maintains sliding window buffers per class (default 1MB)\n- Rebuilds compressors every N samples (default 5) to prevent state corruption\n- Configurable compression levels (1-22) trade speed for accuracy\n\n**Benchmark Results (20 newsgroups, 4 classes):**\n- **91% accuracy** achieved in **1.9 seconds** (3,387 documents)\n- Compares favorably to LZW-based approach: 89% accuracy in 32 minutes\n- Competitive with batch TF-IDF + logistic regression baseline\n- Per-class F1-scores: comp.graphics (0.92), sci.space (0.94), alt.atheism (0.90), talk.religion.misc (0.86)\n\n**Advantages:** No matrices, gradients, or backpropagation\u2014learning is delegated entirely to the compression algorithm. Zstd's incremental API avoids recompressing training data for each prediction, making this practical for the first time.",
        "url": "https://maxhalford.github.io/blog/text-classification-zstd/",
        "id": 46942864,
        "slug": "text-classification-with-python-314s-zstd-module",
        "points": 208,
        "comments": 43,
        "comments_url": "https://news.ycombinator.com/item?id=46942864",
        "sentiment": "## Overall Sentiment\n\nThe discussion is **mixed-to-skeptical** (~45% critical, ~30% neutral/informational, ~25% positive). While commenters appreciate the cleverness and Python 3.14 stdlib practicality, the dominant technical view is skeptical of compression-based classification as a methodology, with several experts noting it measures lexical overlap rather than semantic meaning, and solves a harder problem than necessary for classification tasks.\n\n## Key Themes\n\n- **Theoretical Limitations**: Compression-based classification measures form/shape (shared substrings) not semantic meaning\u2014English texts on different topics compress better than English-Spanish texts on the same topic (Jaxan, duskwuff, D-Machine)\n- **Methodological Critiques**: The approach is \"solving a task much harder than necessary\" (srean)\u2014optimal compression requires correct probability estimation, but good classifiers don't need correct probability estimates\n- **Historical Context**: Previous papers on this topic (2023 gzip+kNN) had implementation errors including data leakage where test labels were used in the decision method (ks2048, shoo)\n- **Practical Viability**: Despite limitations, it's \"in Python stdlib, works reasonably well, so for some applications it might be good enough\" (notpushkin)\u2014demonstrated with shell one-liners using `zstd --train`\n- **Python 3.14 Angle**: Significant enthusiasm for stdlib inclusion eliminating C extension build dependencies and improving reproducibility (matheus-rr)\n- **LLM Compression**: Tangential debate about whether LLMs are lossless compressors (they can be with arithmetic coding, but are impractical due to size/speed)\n\n## Notable Perspectives\n\n- **ks2048**: Highly skeptical, authored detailed refutations of a 2023 paper on this topic, citing \"bad implementation and bad data\" including test label leakage\n- **duskwuff**: Technical critique that Zstd classification is \"effectively just a complicated way of measuring how many words and phrases the two documents have in common... unnecessarily complex and easily confused\"\n- **notpushkin**: Practical advocate demonstrating the technique works with simple shell scripts and trained dictionaries, arguing deployment simplicity matters\n- **stephantul**: Methodological critique that the article's speed comparison was unfair\u2014didn't standardize features, used suboptimal solver settings, and only tested 4 of 20 available classes\n\n## Consensus & Disagreements\n\n**Consensus**: Data compression \u2260 semantic compression; Python 3.14's stdlib inclusion is practically valuable for reproducibility; previous academic work in this space had significant implementation flaws\n\n**Fault Lines**: Whether the approach is fundamentally flawed vs. \"good enough\" for production use; whether the article fairly benchmarked against logistic regression baselines; whether LLMs constitute viable lossless compression (disagreement on determinism and practicality)",
        "top_comment": {
            "id": 46982881,
            "by": "ks2048",
            "text": "This looks like a nice rundown of how to do this with Python's zstd module.\n\nBut, I'm skeptical of using compressors *directly* for ML/AI/etc. (yes, compression and intelligence are very closely related, but practical compressors and practical classifiers have different goals and different practical constraints).\n\nBack in 2023, I wrote two blog-posts [0,1] that refused the results in the 2023 paper referenced here (bad implementation and bad data).\n\n[0] https://kenschutte.com/gzip-knn-paper/ (https://kenschutte.com/gzip-knn-paper/)\n\n[1] https://kenschutte.com/gzip-knn-paper2/ (https://kenschutte.com/gzip-knn-paper2/)",
            "time": 1770853629,
            "children": [
            {
                "id": 46984019,
                "by": "duskwuff",
                "text": "Concur. Zstandard is a good compressor, but it's not magical; comparing the compressed size of Zstd(A+B) to the common size of Zstd(A) + Zstd(B) is effectively just a complicated way of measuring how many words and phrases the two documents have in common. Which isn't *entirely* ineffective at judging whether they're about the same topic, but it's an unnecessarily complex and easily confused way of doing so.",
                "time": 1770861804,
                "children": [
                {
                    "id": 46987588,
                    "by": "andai",
                    "text": "If I'm reading this right, you're saying it's functionally equivalent to measuring the intersection of ngrams? That sounds very testable.",
                    "time": 1770897023,
                    "children": []
                },
                {
                    "id": 46985835,
                    "by": "srean",
                    "text": "I do not know inner details of Zstandard, but I would expect that it to least do suffix/prefix stats or word fragment stats, not just words and phrases.",
                    "time": 1770881422,
                    "children": [
                    {
                        "id": 46987231,
                        "by": "Jaxan",
                        "text": "The thing is that two English texts on completely different topics will compress better than say and English and Spanish text on exactly the same topic. So compression really only looks at the form/shape of text and not meaning.",
                        "time": 1770893941,
                        "children": [
                        {
                            "id": 46987611,
                            "by": "srean",
                            "text": "Yes of course, I don't think anyone will disagree with that. My comment had nothing to do with meaning but was about the mechanics of compression.\n\nThat said, lexical and syntactic patterns are often enough for classification and clustering in a scenario where the meaning-to-lexicons mapping is fixed.\n\nThe reason compression based classifiers trail a little behind classifiers built from first principles, even in this fixed mapping case, is a little subtle.\n\nOptimal compression requires correct probability estimation. Correct  probability estimation will yield optimal classifier. In other words, optimal compressors, equivalently correct probability estimators are *sufficient*.\n\nThey are however not *necessary*. One can obtain the theoretical best classifier without estimating the probabilities correctly.\n\nSo in the context of classification, compressors are solving a task that is much much harder than necessary.",
                            "time": 1770897186,
                            "children": []
                        }
                        ]
                    },
                    {
                        "id": 46986447,
                        "by": "duskwuff",
                        "text": "It's not specifically aware of the syntax - it'll match any repeated substrings. That just happens to usually end up meaning words and phrases in English text.",
                        "time": 1770886885,
                        "children": []
                    }
                    ]
                },
                {
                    "id": 46985337,
                    "by": "D-Machine",
                    "text": "Yup. Data compression \u2260 semantic compression.",
                    "time": 1770876114,
                    "children": []
                }
                ]
            },
            {
                "id": 46983031,
                "by": "shoo",
                "text": "Good on you for attempting to reproduce the results & writing it up, and reporting the issue to the authors.\n\n> It turns out that the classification method used in their code looked at the test label as part of the decision method and thus led to an unfair comparison to the baseline results",
                "time": 1770854702,
                "children": []
            }
            ]
        }
    }    
    """;

    [Test]
    public void Import_HackerNewsPost()
    {
        var post = PostJson.FromJson<ServiceModel.ImportNewsPost>();

        post.PrintDump();
    }
}