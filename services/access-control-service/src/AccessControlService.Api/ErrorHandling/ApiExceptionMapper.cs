using System.Net.Sockets;
using AccessControlService.Api.Controllers;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AccessControlService.Api.ErrorHandling;

public sealed record ApiError(int Status, string Title, string Detail);

public static class ApiExceptionMapper
{
    public static bool TryMap(Exception exception, out ApiError error)
    {
        error = exception switch
        {
            UnauthorizedException => new(401, "Unauthorized", "Authentication is required."),
            ForbiddenException => new(403, "Forbidden", "The required permission is missing."),
            ServiceUnavailableException => new(
                503,
                "Service Unavailable",
                "A required authorization dependency is unavailable."),
            ValidationException => new(400, "Bad Request", "The request is invalid."),
            NotFoundException => new(404, "Not Found", "The requested resource was not found."),
            RoleConflictException or IdempotencyConflictException => new(
                409,
                "Conflict",
                "The operation conflicts with current state."),
            DbUpdateException => new(409, "Conflict", "The operation conflicts with current state."),
            PostgresException postgresException when
                postgresException.SqlState?.StartsWith("23", StringComparison.Ordinal) == true =>
                new(409, "Conflict", "The operation conflicts with current state."),
            ArgumentException => new(400, "Bad Request", "The request is invalid."),
            _ when IsUnavailable(exception) => new(
                503,
                "Service Unavailable",
                "A required dependency is unavailable."),
            _ => new(500, "Internal Server Error", "An unexpected error occurred."),
        };

        return true;
    }

    public static bool IsUnavailable(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is SocketException or TimeoutException)
            {
                return true;
            }

            if (current is PostgresException postgresException &&
                (postgresException.SqlState?.StartsWith("08", StringComparison.Ordinal) == true))
            {
                return true;
            }

            if (current is NpgsqlException && current is not PostgresException)
            {
                return true;
            }
        }

        return false;
    }

    public static ObjectResult ToProblemDetails(ApiError error) =>
        new(new ProblemDetails
        {
            Status = error.Status,
            Title = error.Title,
            Detail = error.Detail,
        })
        {
            StatusCode = error.Status,
        };
}
