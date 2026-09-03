using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace AccessControlService.Api.ErrorHandling;

public sealed class SafeExceptionHandlingMiddleware
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private readonly RequestDelegate next;

    public SafeExceptionHandlingMiddleware(RequestDelegate next)
    {
        this.next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception exception) when (!context.Response.HasStarted)
        {
            ApiExceptionMapper.TryMap(exception, out ApiError error);
            context.Response.Clear();
            context.Response.StatusCode = error.Status;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(
                new
                {
                    type = $"https://httpstatuses.com/{error.Status}",
                    title = error.Title,
                    status = error.Status,
                    detail = error.Detail,
                },
                SerializerOptions));
        }
    }
}
