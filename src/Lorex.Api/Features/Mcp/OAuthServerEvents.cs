using Microsoft.AspNetCore;
using OpenIddict.Server;
using OpenIddict.Server.AspNetCore;
using static OpenIddict.Abstractions.OpenIddictConstants;
using static OpenIddict.Server.OpenIddictServerEvents;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// What LoreX adds to OpenIddict's own request processing (ADR 0046). Each is a small, ordered step in OpenIddict's
/// pipeline rather than a protocol of LoreX's own: OpenIddict still parses, validates and answers every request.
/// </summary>
internal static class OAuthServerEvents
{
    public static void Register(OpenIddictServerBuilder server)
    {
        server.AddEventHandler<ProcessRequestContext>(handler => handler
            .UseSingletonHandler<UseConfiguredOrigin>()
            .SetOrder(OpenIddictServerAspNetCoreHandlers.ResolveRequestUri.Descriptor.Order + 1)
            .SetType(OpenIddictServerHandlerType.Custom));

        server.AddEventHandler<ValidateAuthorizationRequestContext>(handler => handler
            .UseScopedHandler<ResolveMetadataDocumentClient>()
            .SetOrder(OpenIddictServerHandlers.Authentication.ValidateClientIdParameter.Descriptor.Order + 500)
            .SetType(OpenIddictServerHandlerType.Custom));

        server.AddEventHandler<HandleConfigurationRequestContext>(handler => handler
            .UseSingletonHandler<DescribeClientRegistration>()
            // OpenIddict's own discovery steps start at int.MaxValue - 100_000 and count up: this one goes after them all.
            .SetOrder(int.MaxValue)
            .SetType(OpenIddictServerHandlerType.Custom));
    }

    /// <summary>
    /// OpenIddict builds its own absolute URIs - the endpoints in the discovery document among them - from the request's
    /// scheme and <c>Host</c>. LoreX reads neither for that (<see cref="McpSite"/>): every request is placed on the
    /// configured origin, so the documents name it whatever header arrived, and behind the development proxy too.
    /// </summary>
    private sealed class UseConfiguredOrigin(McpSite site) : IOpenIddictServerHandler<ProcessRequestContext>
    {
        public ValueTask HandleAsync(ProcessRequestContext context)
        {
            if (context.Transaction.GetHttpRequest() is { } request)
            {
                context.BaseUri = site.Issuer;
                context.RequestUri = new Uri(site.Issuer, request.Path.ToUriComponent() + request.QueryString.ToUriComponent());
            }

            return ValueTask.CompletedTask;
        }
    }

    /// <summary>
    /// A client identified by the URL of its metadata document (CIMD) is known to LoreX by fetching that document, before
    /// OpenIddict looks the client up. A document that cannot be fetched or does not hold up refuses the request as an
    /// unknown client - shown in LoreX, never sent to a redirect URI nothing has vouched for yet.
    /// </summary>
    private sealed class ResolveMetadataDocumentClient(ClientMetadataDocuments documents)
        : IOpenIddictServerHandler<ValidateAuthorizationRequestContext>
    {
        public async ValueTask HandleAsync(ValidateAuthorizationRequestContext context)
        {
            if (!ClientMetadataDocuments.IsDocumentClientId(context.ClientId))
            {
                return;
            }

            if (await documents.EnsureApplicationAsync(context.ClientId!, context.CancellationToken) is { } problem)
            {
                context.Reject(error: Errors.InvalidClient, description: problem);
            }
        }
    }

    /// <summary>
    /// The discovery document says how a client gets an id here - a metadata document (CIMD, preferred) or registration
    /// (DCR, for older clients) - and that public clients are welcome; it stops offering what an OpenID provider would,
    /// because this is not one.
    /// </summary>
    private sealed class DescribeClientRegistration(McpSite site) : IOpenIddictServerHandler<HandleConfigurationRequestContext>
    {
        public ValueTask HandleAsync(HandleConfigurationRequestContext context)
        {
            context.Metadata["client_id_metadata_document_supported"] = true;
            context.Metadata["registration_endpoint"] = $"{site.Base}{ClientRegistrationEndpoints.RegisterPath}";
            context.TokenEndpointAuthenticationMethods.Add(ClientAuthenticationMethods.None);
            context.RevocationEndpointAuthenticationMethods.Add(ClientAuthenticationMethods.None);

            context.Claims.Clear();
            context.IdTokenSigningAlgorithms.Clear();
            context.SubjectTypes.Clear();

            return ValueTask.CompletedTask;
        }
    }
}
