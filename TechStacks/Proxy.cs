using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Threading;

namespace TechStacks;

public static class Proxy
{
    public static bool TryStartNode(string workingDirectory, out Process process, string logPrefix="[node]")
    {
        process = new Process 
        {
            StartInfo = new() {
                FileName = "npm",
                Arguments = "run dev",
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }, 
            EnableRaisingEvents = true,
        };
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.OutputDataReceived += (s, e) => {
            if (e.Data != null)
            {
                Console.Write(logPrefix + ":");
                Console.WriteLine(e.Data);
            }
        };
        process.ErrorDataReceived += (s, e) => {
            if (e.Data != null)
            {
                Console.Write(logPrefix + " ERROR:");
                Console.WriteLine(e.Data);
            }
        };
        if (!process.Start())
        {
            return false;
        }
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();        
        return true;
    }

    static bool IsHopByHopHeader(string headerName)
    {
        return headerName.Equals("Connection", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Keep-Alive", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Proxy-Connection", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Upgrade", StringComparison.OrdinalIgnoreCase);
    }

    public static async Task HttpToNode(HttpContext context, HttpClient nextClient)
    {
        var request = context.Request;

        // Build relative URI (path + query)
        var path = request.Path.HasValue ? request.Path.Value : "/";
        var query = request.QueryString.HasValue ? request.QueryString.Value : string.Empty;
        var targetUri = new Uri(path + query, UriKind.Relative);

        using var forwardRequest = new HttpRequestMessage(new HttpMethod(request.Method), targetUri);

        // Copy headers (excluding hop-by-hop headers)
        foreach (var header in request.Headers)
        {
            if (IsHopByHopHeader(header.Key))
                continue;

            if (!forwardRequest.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray()))
            {
                forwardRequest.Content?.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
            }
        }

        // Copy body for non-GET methods
        if (!HttpMethods.IsGet(request.Method) &&
            !HttpMethods.IsHead(request.Method) &&
            !HttpMethods.IsDelete(request.Method) &&
            !HttpMethods.IsTrace(request.Method))
        {
            forwardRequest.Content = new StreamContent(request.Body);
        }

        using var response = await nextClient.SendAsync(
            forwardRequest,
            HttpCompletionOption.ResponseHeadersRead,
            context.RequestAborted);

        context.Response.StatusCode = (int)response.StatusCode;
        foreach (var header in response.Headers)
        {
            if (IsHopByHopHeader(header.Key))
                continue;

            context.Response.Headers[header.Key] = header.Value.ToArray();
        }
        foreach (var header in response.Content.Headers)
        {
            if (IsHopByHopHeader(header.Key))
                continue;

            context.Response.Headers[header.Key] = header.Value.ToArray();
        }

        // ASP.NET Core will set its own transfer-encoding
        context.Response.Headers.Remove("transfer-encoding");

        await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
    }

    public static void MapNotFoundToNode(WebApplication app, HttpClient nextClient, string[] ignorePaths)
    {
        app.Use(async (context, next) =>
        {
            await next();

            if (context.Response.StatusCode == StatusCodes.Status404NotFound &&
                !context.Response.HasStarted)
            {
                var pathValue = context.Request.Path.Value ?? string.Empty;

                // Keep backend/api/identity/swagger/auth 404s as-is
                if (ignorePaths.Any(x => pathValue.StartsWith(x, StringComparison.OrdinalIgnoreCase)))
                {
                    return;
                }

                // Clear the 404 and let Next handle it
                context.Response.Clear();
                await HttpToNode(context, nextClient);
            }
        });
    }

    public static async Task WebSocketToNode(HttpContext context, Uri nextServerBase, bool allowInvalidCerts)
    {
        using var clientSocket = await context.WebSockets.AcceptWebSocketAsync();

        using var nextSocket = new ClientWebSocket();
        if (allowInvalidCerts && nextServerBase.Scheme == "https")
        {
            nextSocket.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
        }

        if (context.Request.Headers.TryGetValue("Cookie", out var cookieValues))
        {
            nextSocket.Options.SetRequestHeader("Cookie", cookieValues.ToString());
        }

        var builder = new UriBuilder(nextServerBase)
        {
            Scheme = nextServerBase.Scheme == "https" ? "wss" : "ws",
            Path = context.Request.Path.HasValue ? context.Request.Path.Value : "/",
            Query = context.Request.QueryString.HasValue
                ? context.Request.QueryString.Value!.TrimStart('?')
                : string.Empty
        };

        await nextSocket.ConnectAsync(builder.Uri, context.RequestAborted);

        var forwardTask = PumpWebSocket(clientSocket, nextSocket, context.RequestAborted);
        var reverseTask = PumpWebSocket(nextSocket, clientSocket, context.RequestAborted);

        await Task.WhenAll(forwardTask, reverseTask);
    }

    static async Task PumpWebSocket(
        WebSocket source,
        WebSocket destination,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];

        while (source.State == WebSocketState.Open &&
            destination.State == WebSocketState.Open)
        {
            var result = await source.ReceiveAsync(
                new ArraySegment<byte>(buffer), cancellationToken);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                await destination.CloseAsync(
                    source.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                    source.CloseStatusDescription,
                    cancellationToken);
                break;
            }

            await destination.SendAsync(
                new ArraySegment<byte>(buffer, 0, result.Count),
                result.MessageType,
                result.EndOfMessage,
                cancellationToken);
        }
    }
}
