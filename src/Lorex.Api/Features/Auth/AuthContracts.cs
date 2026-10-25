namespace Lorex.Api.Features.Auth;

/// <summary>Registration input. Password is never echoed back or logged.</summary>
public sealed record RegisterRequest(string? Username, string? Email, string? Password);

/// <summary>Login input. The identifier may be either the username or the email address.</summary>
public sealed record LoginRequest(string? UsernameOrEmail, string? Password);

/// <summary>
/// The only user shape that leaves the API. Identity entities are never exposed. <c>IsAdmin</c> only decides whether the
/// client offers the Admin workspace (#40); every Admin route checks the role again on the server.
/// </summary>
public sealed record AuthUserResponse(string Id, string Username, string Email, bool IsAdmin);
