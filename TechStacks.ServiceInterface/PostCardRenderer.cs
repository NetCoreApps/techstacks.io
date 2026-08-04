using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using SkiaSharp;
using TechStacks.ServiceModel.Types;

namespace TechStacks.ServiceInterface;

/// <summary>
/// Renders a social share card (SVG + PNG) for a Post's title/tags, used as
/// the og:image/twitter:image for /posts/{id}/{slug} pages. Twitter/Facebook
/// crawlers only accept raster image formats for card images, so the PNG is
/// what's referenced in meta tags; the SVG is served alongside for direct/
/// preview use. Both share one Layout so wrapping/sizing/positioning never
/// drift apart, and title tiers are chosen against a fixed vertical budget
/// so tags can never collide with a long, wrapped title.
/// </summary>
public static class PostCardRenderer
{
    const int Width = 1200;
    const int Height = 630;
    const int Margin = 72;
    const int MaxTags = 4;
    const float MaxTagPillWidth = 220f;
    const float TagFontSize = 24f;
    const float TagPaddingX = 20f;
    const float TagPillHeight = 44f;
    const float TagGap = 14f;
    const float TagGapAboveTitle = 28f;
    const float ContentTop = 170f;
    const float ContentBottom = 610f;

    // (font size, max lines) tried largest-first; each has been sized so
    // MaxLines * LineHeight always fits within ContentBottom - ContentTop.
    static readonly (float FontSize, int MaxLines)[] TitleTiers =
    [
        (64f, 3),
        (52f, 4),
        (44f, 4),
    ];

    static readonly string[] TagPalette =
    {
        "#818cf8", // indigo-400
        "#38bdf8", // sky-400
        "#34d399", // emerald-400
        "#fbbf24", // amber-400
        "#f472b6", // pink-400
    };

    static readonly SKTypeface Typeface = LoadEmbeddedTypeface();

    static SKTypeface LoadEmbeddedTypeface()
    {
        var asm = typeof(PostCardRenderer).Assembly;
        var resourceName = asm.GetManifestResourceNames()
            .FirstOrDefault(x => x.EndsWith("Inter.ttf", StringComparison.Ordinal));
        if (resourceName == null)
            throw new InvalidOperationException("Embedded font 'Inter.ttf' not found");

        using var stream = asm.GetManifestResourceStream(resourceName)!;
        using var skStream = new SKManagedStream(stream);
        return SKTypeface.FromStream(skStream)
            ?? throw new InvalidOperationException("Failed to load embedded Inter font");
    }

    public sealed class TagPill
    {
        public required string Label;
        public required float Width;
        public required string Color;
    }

    public sealed class Layout
    {
        public required List<string> TitleLines;
        public required float TitleFontSize;
        public required float LineHeight;
        public required float TitleStartY;
        public required float TagsY;
        public required List<TagPill> Tags;
    }

    public static Layout Build(Post post)
    {
        var title = WebUtility.HtmlDecode((post.Title ?? "").Trim());
        var maxWidth = Width - Margin * 2;

        var fontSize = TitleTiers[^1].FontSize;
        var maxLines = TitleTiers[^1].MaxLines;
        var lines = WrapText(title, fontSize, maxWidth);

        foreach (var tier in TitleTiers)
        {
            var wrapped = WrapText(title, tier.FontSize, maxWidth);
            if (wrapped.Count <= tier.MaxLines)
            {
                fontSize = tier.FontSize;
                maxLines = tier.MaxLines;
                lines = wrapped;
                break;
            }
            // Keep the smallest tier's wrap as the fallback in case none fit.
            fontSize = tier.FontSize;
            maxLines = tier.MaxLines;
            lines = wrapped;
        }

        if (lines.Count > maxLines)
        {
            lines = lines.Take(maxLines).ToList();
            lines[^1] = TruncateToWidth(lines[^1], fontSize, maxWidth);
        }

        var tagNames = (post.Tags ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(WebUtility.HtmlDecode)
            .ToList();

        using var tagFont = new SKFont(Typeface, TagFontSize);
        var tags = new List<TagPill>();
        var shown = tagNames.Take(MaxTags).ToList();
        for (var i = 0; i < shown.Count; i++)
        {
            var label = TruncateToWidth(shown[i], TagFontSize, MaxTagPillWidth - TagPaddingX * 2, tagFont);
            var width = tagFont.MeasureText(label) + TagPaddingX * 2;
            tags.Add(new TagPill { Label = label, Width = width, Color = TagPalette[i % TagPalette.Length] });
        }
        if (tagNames.Count > shown.Count)
        {
            var overflow = $"+{tagNames.Count - shown.Count}";
            var width = tagFont.MeasureText(overflow) + TagPaddingX * 2;
            tags.Add(new TagPill { Label = overflow, Width = width, Color = TagPalette[shown.Count % TagPalette.Length] });
        }

        // Vertically center the title+tags block within the content zone so
        // short posts don't leave the bottom half of the card empty, while
        // long (4-line) titles still leave guaranteed room for the tag row.
        var lineHeight = fontSize * 1.28f;
        var titleBlockHeight = lines.Count * lineHeight;
        var tagsBlockHeight = tags.Count > 0 ? TagGapAboveTitle + TagPillHeight : 0f;
        var totalHeight = titleBlockHeight + tagsBlockHeight;
        var available = ContentBottom - ContentTop;
        var offset = Math.Max(0, (available - totalHeight) / 2);
        var blockTop = ContentTop + offset;

        return new Layout
        {
            TitleLines = lines,
            TitleFontSize = fontSize,
            LineHeight = lineHeight,
            TitleStartY = blockTop + fontSize * 0.85f,
            TagsY = blockTop + titleBlockHeight + TagGapAboveTitle,
            Tags = tags,
        };
    }

    static List<string> WrapText(string text, float fontSize, float maxWidth)
    {
        using var font = new SKFont(Typeface, fontSize) { Embolden = true };
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        var current = new StringBuilder();

        foreach (var word in words)
        {
            var candidate = current.Length == 0 ? word : $"{current} {word}";
            if (current.Length == 0 || font.MeasureText(candidate) <= maxWidth)
            {
                current.Clear();
                current.Append(candidate);
            }
            else
            {
                lines.Add(current.ToString());
                current.Clear();
                current.Append(word);
            }
        }
        if (current.Length > 0)
            lines.Add(current.ToString());

        return lines.Count > 0 ? lines : [text];
    }

    static string TruncateToWidth(string text, float fontSize, float maxWidth, SKFont? sharedFont = null)
    {
        using var ownedFont = sharedFont == null ? new SKFont(Typeface, fontSize) { Embolden = true } : null;
        var font = sharedFont ?? ownedFont!;
        if (font.MeasureText(text) <= maxWidth)
            return text;

        var truncated = text;
        while (truncated.Length > 1 && font.MeasureText(truncated + "…") > maxWidth)
            truncated = truncated[..^1];
        return truncated + "…";
    }

    static string XmlEscape(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    public static string RenderSvg(Post post)
    {
        var layout = Build(post);
        var sb = new StringBuilder();
        sb.Append($@"<svg width=""{Width}"" height=""{Height}"" viewBox=""0 0 {Width} {Height}"" xmlns=""http://www.w3.org/2000/svg"">
  <defs>
    <linearGradient id=""bg"" x1=""0%"" y1=""0%"" x2=""100%"" y2=""100%"">
      <stop offset=""0%"" stop-color=""#4f46e5""/>
      <stop offset=""100%"" stop-color=""#312e81""/>
    </linearGradient>
    <filter id=""blur"" x=""-50%"" y=""-50%"" width=""200%"" height=""200%"">
      <feGaussianBlur stdDeviation=""50""/>
    </filter>
  </defs>
  <rect x=""0"" y=""0"" width=""{Width}"" height=""{Height}"" fill=""url(#bg)""/>
  <circle cx=""1050"" cy=""70"" r=""230"" fill=""#ffffff"" opacity=""0.10"" filter=""url(#blur)""/>
  <circle cx=""40"" cy=""600"" r=""170"" fill=""#ffffff"" opacity=""0.07"" filter=""url(#blur)""/>
  <circle cx=""640"" cy=""680"" r=""210"" fill=""#38bdf8"" opacity=""0.12"" filter=""url(#blur)""/>
  <text x=""{Margin}"" y=""70"" font-family=""Inter, sans-serif"" font-size=""22"" font-weight=""600"" fill=""#ffffff"" opacity=""0.85"">techstacks.io</text>
  <rect x=""{Margin}"" y=""86"" width=""140"" height=""4"" rx=""2"" fill=""#818cf8""/>
");

        var y = layout.TitleStartY;
        foreach (var line in layout.TitleLines)
        {
            sb.Append($@"  <text x=""{Margin}"" y=""{y:0.##}"" font-family=""Inter, sans-serif"" font-size=""{layout.TitleFontSize:0.##}"" font-weight=""700"" fill=""#ffffff"">{XmlEscape(line)}</text>
");
            y += layout.LineHeight;
        }

        if (layout.Tags.Count > 0)
        {
            float x = Margin;
            foreach (var tag in layout.Tags)
            {
                sb.Append($@"  <rect x=""{x:0.##}"" y=""{layout.TagsY:0.##}"" width=""{tag.Width:0.##}"" height=""{TagPillHeight}"" rx=""22"" fill=""{tag.Color}"" opacity=""0.24"" stroke=""{tag.Color}"" stroke-width=""1.5""/>
  <text x=""{x + TagPaddingX:0.##}"" y=""{layout.TagsY + TagPillHeight / 2 + 8:0.##}"" font-family=""Inter, sans-serif"" font-size=""{TagFontSize}"" font-weight=""600"" fill=""#ffffff"">{XmlEscape(tag.Label)}</text>
");
                x += tag.Width + TagGap;
            }
        }

        sb.Append("</svg>");
        return sb.ToString();
    }

    public static byte[] RenderPng(Post post)
    {
        var layout = Build(post);

        using var surface = SKSurface.Create(new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        var canvas = surface.Canvas;

        using (var bgPaint = new SKPaint
        {
            Shader = SKShader.CreateLinearGradient(
                new SKPoint(0, 0), new SKPoint(Width, Height),
                [new SKColor(0x4f, 0x46, 0xe5), new SKColor(0x31, 0x2e, 0x81)],
                null, SKShaderTileMode.Clamp),
        })
        {
            canvas.DrawRect(0, 0, Width, Height, bgPaint);
        }

        DrawAccentCircle(canvas, new SKPoint(1050, 70), 230, new SKColor(255, 255, 255, 26));
        DrawAccentCircle(canvas, new SKPoint(40, 600), 170, new SKColor(255, 255, 255, 18));
        DrawAccentCircle(canvas, new SKPoint(640, 680), 210, new SKColor(0x38, 0xbd, 0xf8, 31));

        using (var wordmarkFont = new SKFont(Typeface, 22) { Embolden = true })
        using (var wordmarkPaint = new SKPaint { Color = new SKColor(255, 255, 255, 217), IsAntialias = true })
        {
            canvas.DrawText("techstacks.io", new SKPoint(Margin, 74), SKTextAlign.Left, wordmarkFont, wordmarkPaint);
        }

        using (var accentBarPaint = new SKPaint { Color = SKColor.Parse("#818cf8"), IsAntialias = true })
        {
            canvas.DrawRoundRect(new SKRect(Margin, 86, Margin + 140, 90), 2, 2, accentBarPaint);
        }

        using (var titleFont = new SKFont(Typeface, layout.TitleFontSize) { Embolden = true })
        using (var titlePaint = new SKPaint { Color = SKColors.White, IsAntialias = true })
        {
            var y = layout.TitleStartY;
            foreach (var line in layout.TitleLines)
            {
                canvas.DrawText(line, new SKPoint(Margin, y), SKTextAlign.Left, titleFont, titlePaint);
                y += layout.LineHeight;
            }
        }

        DrawTags(canvas, layout);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    static void DrawAccentCircle(SKCanvas canvas, SKPoint center, float radius, SKColor color)
    {
        using var paint = new SKPaint
        {
            Color = color,
            IsAntialias = true,
            MaskFilter = SKMaskFilter.CreateBlur(SKBlurStyle.Normal, radius * 0.25f),
        };
        canvas.DrawCircle(center, radius, paint);
    }

    static void DrawTags(SKCanvas canvas, Layout layout)
    {
        if (layout.Tags.Count == 0)
            return;

        using var tagFont = new SKFont(Typeface, TagFontSize) { Embolden = true };
        using var textPaint = new SKPaint { Color = SKColors.White, IsAntialias = true };

        float x = Margin;
        foreach (var tag in layout.Tags)
        {
            var color = SKColor.Parse(tag.Color);
            var rect = new SKRect(x, layout.TagsY, x + tag.Width, layout.TagsY + TagPillHeight);

            using (var fillPaint = new SKPaint { Color = color.WithAlpha(61), IsAntialias = true })
                canvas.DrawRoundRect(rect, 22, 22, fillPaint);
            using (var borderPaint = new SKPaint { Color = color, IsAntialias = true, IsStroke = true, StrokeWidth = 1.5f })
                canvas.DrawRoundRect(rect, 22, 22, borderPaint);

            canvas.DrawText(tag.Label, new SKPoint(x + TagPaddingX, layout.TagsY + TagPillHeight / 2 + 8), SKTextAlign.Left, tagFont, textPaint);

            x += tag.Width + TagGap;
        }
    }
}
