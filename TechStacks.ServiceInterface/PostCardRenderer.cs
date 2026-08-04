using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using SkiaSharp;
using TechStacks.ServiceModel;
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
    const float ContentTop = 80f;
    const float ContentBottom = 600f;

    public static readonly List<CardPalette> DefaultPalettes = new()
    {
        new CardPalette { Id = "slate", Name = "Slate", BgStart = "#475569", BgEnd = "#0f172a", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#94a3b8" },
        new CardPalette { Id = "gray", Name = "Gray", BgStart = "#4b5563", BgEnd = "#111827", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#9ca3af" },
        new CardPalette { Id = "zinc", Name = "Zinc", BgStart = "#52525b", BgEnd = "#18181b", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#a1a1aa" },
        new CardPalette { Id = "neutral", Name = "Neutral", BgStart = "#525252", BgEnd = "#171717", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#a3a3a3" },
        new CardPalette { Id = "stone", Name = "Stone", BgStart = "#57534e", BgEnd = "#1c1917", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#a8a29e" },
        new CardPalette { Id = "red", Name = "Red", BgStart = "#dc2626", BgEnd = "#7f1d1d", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#fca5a5" },
        new CardPalette { Id = "orange", Name = "Orange", BgStart = "#ea580c", BgEnd = "#7c2d12", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#fdba74" },
        new CardPalette { Id = "amber", Name = "Amber", BgStart = "#d97706", BgEnd = "#78350f", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#fde047" },
        new CardPalette { Id = "yellow", Name = "Yellow", BgStart = "#ca8a04", BgEnd = "#713f12", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#fef08a" },
        new CardPalette { Id = "lime", Name = "Lime", BgStart = "#65a30d", BgEnd = "#365314", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#bef264" },
        new CardPalette { Id = "green", Name = "Green", BgStart = "#16a34a", BgEnd = "#14532d", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#86efac" },
        new CardPalette { Id = "emerald", Name = "Emerald", BgStart = "#059669", BgEnd = "#064e3b", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#6ee7b7" },
        new CardPalette { Id = "teal", Name = "Teal", BgStart = "#0d9488", BgEnd = "#134e4a", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#5eead4" },
        new CardPalette { Id = "cyan", Name = "Cyan", BgStart = "#0891b2", BgEnd = "#164e63", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#67e8f9" },
        new CardPalette { Id = "sky", Name = "Sky", BgStart = "#0284c7", BgEnd = "#0c4a6e", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#7dd3fc" },
        new CardPalette { Id = "blue", Name = "Blue", BgStart = "#2563eb", BgEnd = "#1e3a8a", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#93c5fd" },
        new CardPalette { Id = "indigo", Name = "Indigo", BgStart = "#4f46e5", BgEnd = "#312e81", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#a5b4fc" },
        new CardPalette { Id = "violet", Name = "Violet", BgStart = "#7c3aed", BgEnd = "#4c1d95", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#c4b5fd" },
        new CardPalette { Id = "purple", Name = "Purple", BgStart = "#9333ea", BgEnd = "#581c87", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#d8b4fe" },
        new CardPalette { Id = "fuchsia", Name = "Fuchsia", BgStart = "#c026d3", BgEnd = "#701a75", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#f0abfc" },
        new CardPalette { Id = "pink", Name = "Pink", BgStart = "#db2777", BgEnd = "#831843", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#f472b6" },
        new CardPalette { Id = "rose", Name = "Rose", BgStart = "#e11d48", BgEnd = "#881337", TitleColor = "#ffffff", DomainColor = "#ffffff", AccentColor = "#fda4af" },
    };

    public static uint Fnv1aHash(string text)
    {
        uint hash = 2166136261;
        foreach (char c in text)
        {
            hash ^= c;
            hash *= 16777619;
        }
        return hash;
    }

    public static CardPalette GetPaletteForTitle(string? title, List<CardPalette>? palettes = null)
    {
        var list = palettes != null && palettes.Count > 0 ? palettes : DefaultPalettes;
        var hash = Fnv1aHash(title ?? "");
        var index = (int)(hash % (uint)list.Count);
        return list[index];
    }

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

    public static Layout Build(Post post) => Build(post.Title, post.Tags);

    public static Layout Build(string? titleText, string[]? tagsList)
    {
        var title = WebUtility.HtmlDecode((titleText ?? "").Trim());
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
            fontSize = tier.FontSize;
            maxLines = tier.MaxLines;
            lines = wrapped;
        }

        if (lines.Count > maxLines)
        {
            lines = lines.Take(maxLines).ToList();
            lines[^1] = TruncateToWidth(lines[^1], fontSize, maxWidth);
        }

        var tagNames = (tagsList ?? Array.Empty<string>())
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

        var lineHeight = fontSize * 1.28f;
        var titleBlockHeight = lines.Count * lineHeight;
        var tagsBlockHeight = tags.Count > 0 ? TagGapAboveTitle + TagPillHeight : TagGapAboveTitle + TagPillHeight;
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

    public static string GetInitialLetter(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "";
        var trimmed = title.Trim();
        foreach (var ch in trimmed)
        {
            if (char.IsLetterOrDigit(ch))
                return ch.ToString().ToUpperInvariant();
        }
        return trimmed[0].ToString().ToUpperInvariant();
    }

    public static string RenderSvg(Post post, CardPalette? customPalette = null, List<CardPalette>? palettes = null) =>
        RenderSvg(post.Title, post.Tags, customPalette ?? GetPaletteForTitle(post.Title, palettes));

    public static string RenderSvg(string? title, string[]? tags, CardPalette palette)
    {
        var layout = Build(title, tags);
        var sb = new StringBuilder();
        var bgStart = palette.BgStart;
        var bgEnd = palette.BgEnd;
        var titleColor = palette.TitleColor;
        var domainColor = palette.DomainColor;

        sb.Append($@"<svg width=""{Width}"" height=""{Height}"" viewBox=""0 0 {Width} {Height}"" xmlns=""http://www.w3.org/2000/svg"">
  <defs>
    <linearGradient id=""bg"" x1=""0%"" y1=""0%"" x2=""100%"" y2=""100%"">
      <stop offset=""0%"" stop-color=""{bgStart}""/>
      <stop offset=""100%"" stop-color=""{bgEnd}""/>
    </linearGradient>
    <filter id=""blur"" x=""-50%"" y=""-50%"" width=""200%"" height=""200%"">
      <feGaussianBlur stdDeviation=""50""/>
    </filter>
  </defs>
  <rect x=""0"" y=""0"" width=""{Width}"" height=""{Height}"" fill=""url(#bg)""/>
  <circle cx=""1050"" cy=""70"" r=""230"" fill=""#ffffff"" opacity=""0.10"" filter=""url(#blur)""/>
  <circle cx=""40"" cy=""600"" r=""170"" fill=""#ffffff"" opacity=""0.07"" filter=""url(#blur)""/>
  <circle cx=""640"" cy=""680"" r=""210"" fill=""#38bdf8"" opacity=""0.12"" filter=""url(#blur)""/>
");

        var initial = GetInitialLetter(title);
        if (!string.IsNullOrEmpty(initial))
        {
            sb.Append($@"  <text x=""600"" y=""540"" text-anchor=""middle"" font-family=""Inter, sans-serif"" font-weight=""800"" font-size=""670"" fill=""#ffffff"" opacity=""0.06"">{XmlEscape(initial)}</text>
");
        }

        var y = layout.TitleStartY;
        foreach (var line in layout.TitleLines)
        {
            sb.Append($@"  <text x=""{Margin}"" y=""{y:0.##}"" font-family=""Inter, sans-serif"" font-size=""{layout.TitleFontSize:0.##}"" font-weight=""700"" fill=""{titleColor}"">{XmlEscape(line)}</text>
");
            y += layout.LineHeight;
        }

        var domainY = layout.TagsY + TagPillHeight / 2 + 8;
        sb.Append($@"  <text x=""{Width - Margin}"" y=""{domainY:0.##}"" text-anchor=""end"" font-family=""Inter, sans-serif"" font-size=""28"" font-weight=""700"" fill=""{domainColor}"" opacity=""0.85"">techstacks.io</text>
");

        if (layout.Tags.Count > 0)
        {
            float x = Margin;
            var tagColor = !string.IsNullOrWhiteSpace(palette.AccentColor) ? palette.AccentColor : "#ffffff";
            foreach (var tag in layout.Tags)
            {
                sb.Append($@"  <rect x=""{x:0.##}"" y=""{layout.TagsY:0.##}"" width=""{tag.Width:0.##}"" height=""{TagPillHeight}"" rx=""22"" fill=""{tagColor}"" opacity=""0.24"" stroke=""{tagColor}"" stroke-width=""1.5""/>
  <text x=""{x + TagPaddingX:0.##}"" y=""{layout.TagsY + TagPillHeight / 2 + 8:0.##}"" font-family=""Inter, sans-serif"" font-size=""{TagFontSize}"" font-weight=""600"" fill=""#ffffff"">{XmlEscape(tag.Label)}</text>
");
                x += tag.Width + TagGap;
            }
        }

        sb.Append("</svg>");
        return sb.ToString();
    }

    public static byte[] RenderPng(Post post, CardPalette? customPalette = null, List<CardPalette>? palettes = null) =>
        RenderPng(post.Title, post.Tags, customPalette ?? GetPaletteForTitle(post.Title, palettes));

    public static byte[] RenderPng(string? title, string[]? tags, CardPalette palette)
    {
        var layout = Build(title, tags);

        using var surface = SKSurface.Create(new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        var canvas = surface.Canvas;

        var startColor = ParseSKColor(palette.BgStart, new SKColor(0x4f, 0x46, 0xe5));
        var endColor = ParseSKColor(palette.BgEnd, new SKColor(0x31, 0x2e, 0x81));

        using (var bgPaint = new SKPaint
        {
            Shader = SKShader.CreateLinearGradient(
                new SKPoint(0, 0), new SKPoint(Width, Height),
                [startColor, endColor],
                null, SKShaderTileMode.Clamp),
        })
        {
            canvas.DrawRect(0, 0, Width, Height, bgPaint);
        }

        DrawAccentCircle(canvas, new SKPoint(1050, 70), 230, new SKColor(255, 255, 255, 26));
        DrawAccentCircle(canvas, new SKPoint(40, 600), 170, new SKColor(255, 255, 255, 18));
        DrawAccentCircle(canvas, new SKPoint(640, 680), 210, new SKColor(0x38, 0xbd, 0xf8, 31));

        var initial = GetInitialLetter(title);
        if (!string.IsNullOrEmpty(initial))
        {
            using var initialFont = new SKFont(Typeface, 670) { Embolden = true };
            using var initialPaint = new SKPaint { Color = SKColors.White.WithAlpha(15), IsAntialias = true };
            var textBounds = new SKRect();
            initialFont.MeasureText(initial, out textBounds);
            var x = (Width - textBounds.Width) / 2 - textBounds.Left;
            var y = Height / 2 - textBounds.MidY + 10;
            canvas.DrawText(initial, new SKPoint(x, y), SKTextAlign.Left, initialFont, initialPaint);
        }

        var titleColor = ParseSKColor(palette.TitleColor, SKColors.White);
        using (var titleFont = new SKFont(Typeface, layout.TitleFontSize) { Embolden = true })
        using (var titlePaint = new SKPaint { Color = titleColor, IsAntialias = true })
        {
            var y = layout.TitleStartY;
            foreach (var line in layout.TitleLines)
            {
                canvas.DrawText(line, new SKPoint(Margin, y), SKTextAlign.Left, titleFont, titlePaint);
                y += layout.LineHeight;
            }
        }

        var domainColor = ParseSKColor(palette.DomainColor, SKColors.White).WithAlpha(217);
        using (var domainFont = new SKFont(Typeface, 28) { Embolden = true })
        using (var domainPaint = new SKPaint { Color = domainColor, IsAntialias = true })
        {
            canvas.DrawText("techstacks.io", new SKPoint(Width - Margin, layout.TagsY + TagPillHeight / 2 + 8), SKTextAlign.Right, domainFont, domainPaint);
        }

        DrawTags(canvas, layout, palette);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    static SKColor ParseSKColor(string hex, SKColor fallback)
    {
        if (string.IsNullOrWhiteSpace(hex)) return fallback;
        try { return SKColor.Parse(hex); }
        catch { return fallback; }
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

    static void DrawTags(SKCanvas canvas, Layout layout, CardPalette palette)
    {
        if (layout.Tags.Count == 0)
            return;

        using var tagFont = new SKFont(Typeface, TagFontSize) { Embolden = true };
        using var textPaint = new SKPaint { Color = SKColors.White, IsAntialias = true };

        var tagColor = ParseSKColor(palette.AccentColor, SKColors.White);

        float x = Margin;
        foreach (var tag in layout.Tags)
        {
            var rect = new SKRect(x, layout.TagsY, x + tag.Width, layout.TagsY + TagPillHeight);

            using (var fillPaint = new SKPaint { Color = tagColor.WithAlpha(61), IsAntialias = true })
                canvas.DrawRoundRect(rect, 22, 22, fillPaint);
            using (var borderPaint = new SKPaint { Color = tagColor, IsAntialias = true, IsStroke = true, StrokeWidth = 1.5f })
                canvas.DrawRoundRect(rect, 22, 22, borderPaint);

            canvas.DrawText(tag.Label, new SKPoint(x + TagPaddingX, layout.TagsY + TagPillHeight / 2 + 8), SKTextAlign.Left, tagFont, textPaint);

            x += tag.Width + TagGap;
        }
    }
}
