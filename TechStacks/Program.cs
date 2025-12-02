using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ServiceStack;
using ServiceStack.Logging;
using ServiceStack.OrmLite;
using Scalar.AspNetCore;
using TechStacks;
using TechStacks.Data;
using TechStacks.ServiceInterface;

AppHost.RegisterLicense();
var builder = WebApplication.CreateBuilder(args);

var services = builder.Services;
var config = builder.Configuration;
services.AddMvc(options => options.EnableEndpointRouting = false);

services.AddAuthentication(options =>
    {
        options.DefaultScheme = IdentityConstants.ApplicationScheme;
        options.DefaultSignInScheme = IdentityConstants.ExternalScheme;
    })
    .AddGitHub(options =>
    {
        options.ClientId = Environment.GetEnvironmentVariable("GH_CLIENT_ID")
            ?? config["oauth.github.ClientId"]
            ?? throw new Exception("oauth.github.ClientId not found");
        options.ClientSecret = Environment.GetEnvironmentVariable("GH_CLIENT_SECRET")
            ?? config["oauth.github.ClientSecret"]
            ?? throw new Exception("oauth.github.ClientSecret not found");
        options.Scope.Add("user:email");
        options.CallbackPath = "/signin-oidc-github";
    })
    // .AddScheme<AuthenticationSchemeOptions,BasicAuthenticationHandler<ApplicationUser,int>>(BasicAuthenticationHandler.Scheme, null)
    .AddIdentityCookies(options => options.DisableRedirectsForApis());
services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo("App_Data"));

services.AddAuthorization();

// $ dotnet ef migrations add CreateIdentitySchema
// $ dotnet ef database update
services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(AppHost.Connection, b => b.MigrationsAssembly(nameof(TechStacks))));

services.AddIdentityCore<ApplicationUser>(options => options.SignIn.RequireConfirmedAccount = true)
    .AddRoles<ApplicationRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();
builder.Services.AddScoped<IUserClaimsPrincipalFactory<ApplicationUser>, AdditionalUserClaimsPrincipalFactory>();

services.AddRazorPages();
services.Configure<IdentityOptions>(options =>
{
    options.Password.RequireDigit = true;
    options.Password.RequiredLength = 8;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireUppercase = true;
    options.Password.RequireLowercase = false;
    options.Password.RequiredUniqueChars = 6;

    // Lockout settings
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(30);
    options.Lockout.MaxFailedAccessAttempts = 10;
    options.Lockout.AllowedForNewUsers = true;

    // User settings
    options.User.RequireUniqueEmail = true;
});
services.ConfigureApplicationCookie(options =>
{
    // Cookie settings
    options.Cookie.HttpOnly = true;
    options.ExpireTimeSpan = TimeSpan.FromDays(150);
    // If the LoginPath isn't set, ASP.NET Core defaults
    // the path to /Account/Login.
    options.LoginPath = "/Identity/Account/Login";
    options.AccessDeniedPath = "/Identity/Account/AccessDenied";
    options.LogoutPath = "/Identity/Account/Logout";
    options.SlidingExpiration = true;
});
// Add application services.
services.AddTransient<IEmailSender, EmailSender>();
services.AddScoped<IUserClaimsPrincipalFactory<ApplicationUser>, AdditionalUserClaimsPrincipalFactory>();

services.AddOpenApi(options =>
{
    // Exclude Razor Pages from OpenAPI document
    options.ShouldInclude = (description) =>
    {
        // Only include ServiceStack endpoints
        return description.ActionDescriptor.DisplayName?.Contains("ServiceStack") == true;
    };
});
services.AddServiceStackOpenApi();
services.AddServiceStack(typeof(TechnologyServices).Assembly);

//https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-3.1
services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

var app = builder.Build();
// Proxy 404s to Next.js (except for API/backend routes) must be registered before endpoints
var nodeProxy = new NodeProxy("http://localhost:3000") {
    Log = app.Logger
};

app.UseForwardedHeaders();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseMigrationsEndPoint();

    app.MapNotFoundToNode(nodeProxy);
}
else
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapCleanUrls();
app.UseCors();

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapRazorPages();

// GitHub OAuth endpoint
app.MapGet("/auth/github", (
    HttpContext context,
    SignInManager<ApplicationUser> signInManager,
    string? returnUrl) =>
{
    // Request a redirect to the external login provider.
    returnUrl ??= "/";
    var redirectUrl = $"/Identity/Account/ExternalLogin?handler=Callback&returnUrl={Uri.EscapeDataString(returnUrl)}";
    var properties = signInManager.ConfigureExternalAuthenticationProperties("GitHub", redirectUrl);
    return TypedResults.Challenge(properties, ["GitHub"]);
});

app.UseServiceStack(new AppHost(), options =>
{
    options.MapEndpoints();
});

app.UseAntiforgery();

app.MapRazorPages();
app.MapAdditionalIdentityEndpoints();

// Map OpenAPI and Scalar endpoints after ServiceStack
// if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// Proxy development HMR WebSocket to the Next.js server
if (app.Environment.IsDevelopment())
{
    app.UseWebSockets();
    app.MapNextHmr(nodeProxy);

    // Start the Next.js dev server if the Next.js lockfile does not exist
    app.RunNodeProcess(nodeProxy,
        lockFile: "../TechStacks.Client/dist/lock",
        workingDirectory: "../TechStacks.Client");
}

app.MapFallbackToNode(nodeProxy);

app.Run();
