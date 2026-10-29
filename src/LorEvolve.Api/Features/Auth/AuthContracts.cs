namespace LorEvolve.Api.Features.Auth;

/// <summary>
/// Registration input. Password is never echoed back or logged. <c>InviteToken</c> is a universe invitation's claim token or
/// an Admin's sign-up link; only invitation-only registration reads it.
/// </summary>
public sealed record RegisterRequest(string? Username, string? Email, string? Password, string? InviteToken = null);

/// <summary>Whether anyone may create an account, or only someone holding an invitation (<c>Registration:InviteOnly</c>).</summary>
public sealed record RegistrationResponse(bool InviteOnly);

/// <summary>Login input. The identifier may be either the username or the email address.</summary>
public sealed record LoginRequest(string? UsernameOrEmail, string? Password);

/// <summary>Forgot password: the address to send a reset link to, if it has an account.</summary>
public sealed record ForgotPasswordRequest(string? Email);

/// <summary>A new password, with the account id and token the reset link carried.</summary>
public sealed record ResetPasswordRequest(string? UserId, string? Token, string? Password);

/// <summary>
/// The only user shape that leaves the API. Identity entities are never exposed. <c>IsAdmin</c> only decides whether the
/// client offers the Admin workspace (#40); every Admin route checks the role again on the server.
/// </summary>
public sealed record AuthUserResponse(string Id, string Username, string Email, bool IsAdmin);
