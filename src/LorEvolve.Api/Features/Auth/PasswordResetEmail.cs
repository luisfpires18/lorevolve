using System.Net;
using LorEvolve.Api.Features.Email;

namespace LorEvolve.Api.Features.Auth;

/// <summary>
/// The email that carries a password reset link (#69), in the same plain table layout as the sign-up email
/// (<see cref="Admin.SignUpEmail"/>): one button, the link written out, how long it works, and what to do if it was not asked
/// for. A plain-text copy beside it; no image.
/// </summary>
public static class PasswordResetEmail
{
    public const string Subject = "Reset your LorEvolve password";

    public static AppEmailMessage For(string to, string link)
    {
        var href = WebUtility.HtmlEncode(link);

        var text = $"""
            Reset your LorEvolve password

            Someone asked to reset the password of the LorEvolve account for this email address. Choose a new one here:
            {link}

            The link works once, for 1 hour. If you didn't ask for this, you can ignore it: your password stays as it is.

            LorEvolve - https://lorevolve.com
            Questions: support@lorevolve.com
            """;

        var html = $$"""
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light dark">
            <meta name="supported-color-schemes" content="light dark">
            <title>{{Subject}}</title>
            </head>
            <body style="margin:0;padding:0;background:#f4f1ea;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;">
              <tr>
                <td align="center" style="padding:32px 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
                    <tr>
                      <td style="padding:0 8px 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.02em;color:#191713;">
                        LorEvolve
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#ffffff;border:1px solid #e3ddd0;border-radius:12px;padding:32px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#191713;">
                        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:normal;line-height:1.3;color:#191713;">
                          Reset your password
                        </h1>
                        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3d382f;">
                          Someone asked to reset the password of the LorEvolve account for this email address.
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                          <tr>
                            <td style="border-radius:8px;background:#191713;">
                              <a href="{{href}}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;color:#f4f1ea;text-decoration:none;border-radius:8px;">
                                Choose a new password
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#675f53;">
                          Or open this link:
                        </p>
                        <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;">
                          <a href="{{href}}" style="color:#4f6bd6;">{{href}}</a>
                        </p>
                        <p style="margin:0;font-size:14px;line-height:1.6;color:#675f53;">
                          The link works once, for 1 hour. If you didn&rsquo;t ask for this, you can ignore it: your
                          password stays as it is.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:20px 8px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#675f53;">
                        <a href="https://lorevolve.com" style="color:#675f53;">lorevolve.com</a>
                        &middot; Questions: <a href="mailto:support@lorevolve.com" style="color:#675f53;">support@lorevolve.com</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            </body>
            </html>
            """;

        return new AppEmailMessage(to, Subject, html, text);
    }
}
