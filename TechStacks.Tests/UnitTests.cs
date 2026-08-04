using System;
using System.IO;
using System.Linq;
using NUnit.Framework;
using ServiceStack;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.Testing;
using ServiceStack.Text;
using TechStacks.ServiceInterface;
using TechStacks.ServiceModel;
using TechStacks.ServiceModel.Types;

namespace TechStacks.Tests;

[TestFixture]
public class UnitTests
{
    private ServiceStackHost appHost;

    [OneTimeSetUp]
    public void Init()
    {
        appHost = new UnitTestHost();
        var debugSettings = new FileInfo(@"~/../../../TechStacks/wwwroot_build/deploy/appsettings.license.txt".MapAbsolutePath());
        Licensing.RegisterLicenseFromFileIfExists(debugSettings.FullName);
        appHost.Init();
    }

    [OneTimeTearDown]
    public void TestFixtureTearDown()
    {
        appHost.Dispose();
    }

    [SetUp]
    public void Setup()
    {
        var dbFactory = appHost.Resolve<IDbConnectionFactory>();
        using var db = dbFactory.OpenDbConnection();
        db.DropAndCreateTable<TechnologyStack>();
        db.DropAndCreateTable<Technology>();
        db.DropAndCreateTable<TechnologyChoice>();
        db.DropAndCreateTable<UserFavoriteTechnologyStack>();
        db.DropAndCreateTable<UserFavoriteTechnology>();

        SeedTestHost();
    }

    [Test]
    public void Can_Get_Stacks()
    {
        var service = appHost.Resolve<CachedTechnologyStackServices>();
        var response = (GetAllTechnologyStacksResponse)service.Get(new GetAllTechnologyStacks());
        var dbFactory = appHost.Resolve<IDbConnectionFactory>();
        using var db = dbFactory.OpenDbConnection();
        
        var allStacks = db.Select<TechnologyStack>().ToList();
        Assert.That(allStacks.Count, Is.EqualTo(response.Results.Count));
    }

    private void SeedTestHost()
    {
        Seeds.SeedApp(appHost.Resolve<IDbConnectionFactory>());
    }

    [Test]
    public void Generate_AuthKey()
    {
        Convert.ToBase64String(AesUtils.CreateKey()).Print();
    }
}

[TestFixture]
public class PostCardTests
{
    [Test]
    public void Can_Render_PostCard()
    {
        var post = new Post { Id = 1, Title = "Test Post Title", Tags = new[] { "dotnet", "c#" } };
        var svg = PostCardRenderer.RenderSvg(post);
        Assert.That(svg, Is.Not.Null.And.Not.Empty);
        Assert.That(svg, Does.Contain("techstacks.io"));
        Assert.That(svg, Does.Contain("text-anchor=\"end\""));

        var png = PostCardRenderer.RenderPng(post);
        Assert.That(png, Is.Not.Null.And.Not.Empty);
    }

    [Test]
    public void Can_Select_Palette_Deterministically()
    {
        var title1 = "Migrating to Next.js 16";
        var title2 = "Building High Performance APIs";

        var palette1a = PostCardRenderer.GetPaletteForTitle(title1);
        var palette1b = PostCardRenderer.GetPaletteForTitle(title1);
        Assert.That(palette1a.Id, Is.EqualTo(palette1b.Id));

        var palette2 = PostCardRenderer.GetPaletteForTitle(title2);
        Assert.That(palette2, Is.Not.Null);
    }

    [Test]
    public void Can_Load_And_Save_Palettes()
    {
        var palettes = CardPaletteServices.LoadPalettes();
        Assert.That(palettes, Is.Not.Null.And.Not.Empty);

        CardPaletteServices.SavePalettesList(palettes);
        var reloaded = CardPaletteServices.LoadPalettes();
        Assert.That(reloaded.Count, Is.EqualTo(palettes.Count));
    }

    [Test]
    public void Can_Extract_Initial_Letter()
    {
        Assert.That(PostCardRenderer.GetInitialLetter("Migrating to Next.js 16"), Is.EqualTo("M"));
        Assert.That(PostCardRenderer.GetInitialLetter("  \"Hello World\""), Is.EqualTo("H"));
        Assert.That(PostCardRenderer.GetInitialLetter("10 Tips for .NET"), Is.EqualTo("1"));
    }
}