using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ServiceStack;
using ServiceStack.Logging;
using ServiceStack.OrmLite;
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

services.AddEndpointsApiExplorer();
services.AddSwaggerGen();

builder.Services.AddServiceStack(typeof(TechnologyServices).Assembly);

//https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-3.1
services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

var app = builder.Build();

var nextServerBase = app.Environment.IsDevelopment()
    ? new Uri("http://localhost:3000")
    : new Uri("http://127.0.0.1:3000");

var allowInvalidCertsForNext = false; // No HTTPS when proxying to Next internally

HttpMessageHandler nextHandler = allowInvalidCertsForNext
    ? new HttpClientHandler
    {
        ServerCertificateCustomValidationCallback =
            HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
    }
    : new HttpClientHandler();

var nextClient = new HttpClient(nextHandler)
{
    BaseAddress = nextServerBase
};

app.UseForwardedHeaders();
app.UseWebSockets();

app.UseMigrationsEndPoint();
app.UseSwagger();
app.UseSwaggerUI();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
    app.UseHttpsRedirection();
}
else
{
    // Production-specific middleware (if needed) can go here
}

// After all .NET middleware has run, let Next.js handle 404s
Proxy.MapNotFoundToNode(app, nextClient, ignorePaths:[
    "/api",
    "/auth",
    "/Identity",
    "/swagger",
]);

app.UseStaticFiles(); // static assets are served by Next.js
app.UseCookiePolicy();
app.UseCors();

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

// Proxy development HMR WebSocket and fallback routes to the Next server
if (app.Environment.IsDevelopment())
{
    app.Map("/_next/webpack-hmr", async context =>
    {
        if (context.WebSockets.IsWebSocketRequest)
        {
            await Proxy.WebSocketToNode(context, nextServerBase, allowInvalidCertsForNext);
        }
        else
        {
            await Proxy.HttpToNode(context, nextClient);
        }
    });

    // Start the Next.js dev server if the Next.js lockfile does not exist '../TechStacks.Client/dist/lock'
    var nextLockFile = "../TechStacks.Client/dist/lock";
    if (!File.Exists(nextLockFile))
    {
        Console.WriteLine("Starting Next.js dev server...");
        if (!Proxy.TryStartNode("../TechStacks.Client", out var process))
        {
            Console.WriteLine($"Failed to start Next.js dev server: {process.ExitCode}");
            return;
        }

        process.Exited += (s, e) => {
            Console.WriteLine("[node] Exited: " + process.ExitCode);
            File.Delete(nextLockFile);
        };

        app.Lifetime.ApplicationStopping.Register(() => {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        });
    }
}

// Fallback: any unmatched route goes to Next.js
app.MapFallback(context => Proxy.HttpToNode(context, nextClient));

app.Run();
