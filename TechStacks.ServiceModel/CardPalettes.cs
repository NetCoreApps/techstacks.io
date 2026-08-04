using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Text.Json.Serialization;
using ServiceStack;

namespace TechStacks.ServiceModel;

[DataContract]
public class CardPalette
{
    [DataMember(Name = "id"), JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [DataMember(Name = "name"), JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [DataMember(Name = "bgStart"), JsonPropertyName("bgStart")]
    public string BgStart { get; set; } = "#4f46e5";

    [DataMember(Name = "bgEnd"), JsonPropertyName("bgEnd")]
    public string BgEnd { get; set; } = "#312e81";

    [DataMember(Name = "titleColor"), JsonPropertyName("titleColor")]
    public string TitleColor { get; set; } = "#ffffff";

    [DataMember(Name = "domainColor"), JsonPropertyName("domainColor")]
    public string DomainColor { get; set; } = "#ffffff";

    [DataMember(Name = "accentColor"), JsonPropertyName("accentColor")]
    public string AccentColor { get; set; } = "#818cf8";
}

[Route("/cards/palettes", "GET")]
[Route("/api/cards/palettes", "GET")]
public class GetCardPalettes : IGet, IReturn<List<CardPalette>>
{
}

[Route("/cards/palettes", "POST")]
[Route("/api/cards/palettes", "POST")]
public class SaveCardPalettes : IPost, IReturn<List<CardPalette>>
{
    public List<CardPalette> Palettes { get; set; } = new();
}

[Route("/cards/preview.svg", "GET")]
[Route("/api/cards/preview.svg", "GET")]
public class GetCardPreviewSvg : IGet
{
    public string? Title { get; set; }
    public string? Tags { get; set; }
    public string? BgStart { get; set; }
    public string? BgEnd { get; set; }
    public string? TitleColor { get; set; }
    public string? DomainColor { get; set; }
    public string? AccentColor { get; set; }
}

[Route("/cards/designer", "GET")]
[Route("/api/cards/designer", "GET")]
public class GetCardDesignerPage : IGet
{
}
