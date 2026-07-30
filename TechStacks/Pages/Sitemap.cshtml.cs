using System;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using TechStacks.ServiceModel.Types;

namespace TechStacks.Pages;

public class SitemapModel : PageModel
{
    private readonly IDbConnectionFactory _dbFactory;

    public SitemapModel(IDbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public string ActiveType { get; set; } = "all";
    public int CurrentPage { get; set; } = 1;
    public int PageSize { get; set; } = 50;
    public int TotalPages { get; set; } = 1;
    public long TotalItems { get; set; } = 0;

    public long TotalPostsCount { get; set; }
    public long TotalTechnologiesCount { get; set; }
    public long TotalTechStacksCount { get; set; }

    public List<Post> Posts { get; set; } = new();
    public List<Technology> Technologies { get; set; } = new();
    public List<TechnologyStack> TechStacks { get; set; } = new();

    public async Task<IActionResult> OnGetAsync(string? type, int? pageNumber)
    {
        using var db = await _dbFactory.OpenAsync();

        var routeType = type ?? Request.Query["type"].ToString();
        ActiveType = string.IsNullOrWhiteSpace(routeType) ? "all" : routeType.ToLower();

        int p = pageNumber ?? (int.TryParse(Request.Query["page"], out var qp) ? qp : 1);
        if (p < 1) p = 1;
        CurrentPage = p;

        TotalPostsCount = await db.CountAsync<Post>(x => x.Deleted == null && x.Hidden == null);
        TotalTechnologiesCount = await db.CountAsync<Technology>();
        TotalTechStacksCount = await db.CountAsync<TechnologyStack>();

        int skip = (CurrentPage - 1) * PageSize;

        switch (ActiveType)
        {
            case "posts":
                TotalItems = TotalPostsCount;
                TotalPages = (int)Math.Ceiling((double)TotalItems / PageSize);
                if (TotalPages < 1) TotalPages = 1;
                Posts = await db.SelectAsync(db.From<Post>()
                    .Where(x => x.Deleted == null && x.Hidden == null)
                    .OrderByDescending(x => x.Id)
                    .Skip(skip)
                    .Take(PageSize));
                break;

            case "technologies":
            case "tech":
                ActiveType = "technologies";
                TotalItems = TotalTechnologiesCount;
                TotalPages = (int)Math.Ceiling((double)TotalItems / PageSize);
                if (TotalPages < 1) TotalPages = 1;
                Technologies = await db.SelectAsync(db.From<Technology>()
                    .OrderByDescending(x => x.LastModified)
                    .ThenByDescending(x => x.Id)
                    .Skip(skip)
                    .Take(PageSize));
                break;

            case "techstacks":
            case "stacks":
                ActiveType = "techstacks";
                TotalItems = TotalTechStacksCount;
                TotalPages = (int)Math.Ceiling((double)TotalItems / PageSize);
                if (TotalPages < 1) TotalPages = 1;
                TechStacks = await db.SelectAsync(db.From<TechnologyStack>()
                    .OrderByDescending(x => x.LastModified)
                    .ThenByDescending(x => x.Id)
                    .Skip(skip)
                    .Take(PageSize));
                break;

            default:
                ActiveType = "all";
                Posts = await db.SelectAsync(db.From<Post>()
                    .Where(x => x.Deleted == null && x.Hidden == null)
                    .OrderByDescending(x => x.Id)
                    .Take(25));

                Technologies = await db.SelectAsync(db.From<Technology>()
                    .OrderByDescending(x => x.LastModified)
                    .ThenByDescending(x => x.Id)
                    .Take(25));

                TechStacks = await db.SelectAsync(db.From<TechnologyStack>()
                    .OrderByDescending(x => x.LastModified)
                    .ThenByDescending(x => x.Id)
                    .Take(25));
                break;
        }

        return Page();
    }

    public static string GetPostUrl(Post post)
    {
        return string.IsNullOrWhiteSpace(post.Slug) 
            ? $"/posts/{post.Id}" 
            : $"/posts/{post.Id}/{post.Slug}";
    }

    public static string GetTechUrl(Technology tech)
    {
        return string.IsNullOrWhiteSpace(tech.Slug) 
            ? $"/tech/{tech.Id}" 
            : $"/tech/{tech.Slug}";
    }

    public static string GetStackUrl(TechnologyStack stack)
    {
        return string.IsNullOrWhiteSpace(stack.Slug) 
            ? $"/stacks/{stack.Id}" 
            : $"/stacks/{stack.Slug}";
    }
}
