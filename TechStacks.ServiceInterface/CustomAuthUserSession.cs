using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using ServiceStack;
using ServiceStack.Auth;
using TechStacks.Data;

namespace TechStacks.ServiceInterface;

public class CustomUserSession : AuthUserSession
{
    public string GithubProfileUrl { get; set; }
}

public class AdditionalUserClaimsPrincipalFactory(
    UserManager<ApplicationUser> userManager,
    RoleManager<ApplicationRole> roleManager,
    IOptions<IdentityOptions> optionsAccessor)
    : UserClaimsPrincipalFactory<ApplicationUser, ApplicationRole>(userManager, roleManager, optionsAccessor)
{
    public override async Task<ClaimsPrincipal> CreateAsync(ApplicationUser user)
    {
        var principal = await base.CreateAsync(user);
        var identity = (ClaimsIdentity)principal.Identity!;

        var claims = new List<Claim>
        {
            // Fallback to the default generated Avatar when User hasn't uploaded their own
            new(JwtClaimTypes.Picture, user.ProfileUrl ?? $"/users/{user.Id}/avatar"),
        };

        identity.AddClaims(claims);
        return principal;
    }
}

public class CustomUserAuth : UserAuth
{
    public string DefaultProfileUrl { get; set; }

    public string IpAddress { get; set; }

    public string RefSource { get; set; }

    public string RefUrn { get; set; }

    public DateTime? Banned { get; set; }

    public string BannedBy { get; set; }

    public string Notes { get; set; }

    public DateTime? DisableEmails { get; set; }

    public string CreatedBy { get; set; }
}
