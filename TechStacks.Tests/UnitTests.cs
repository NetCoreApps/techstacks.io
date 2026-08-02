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

        var png = PostCardRenderer.RenderPng(post);
        Assert.That(png, Is.Not.Null.And.Not.Empty);
    }
}