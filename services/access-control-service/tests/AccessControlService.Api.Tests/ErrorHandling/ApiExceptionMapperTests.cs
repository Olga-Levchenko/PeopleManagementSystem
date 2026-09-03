using AccessControlService.Api.Controllers;
using AccessControlService.Api.ErrorHandling;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AccessControlService.Api.Tests.ErrorHandling;

public sealed class ApiExceptionMapperTests
{
    [Theory]
    [InlineData(typeof(UnauthorizedException), 401)]
    [InlineData(typeof(ForbiddenException), 403)]
    [InlineData(typeof(ValidationException), 400)]
    [InlineData(typeof(NotFoundException), 404)]
    [InlineData(typeof(RoleConflictException), 409)]
    [InlineData(typeof(IdempotencyConflictException), 409)]
    public void KnownDomainExceptions_MapToDocumentedStatus(Type exceptionType, int expectedStatus)
    {
        Exception exception = exceptionType switch
        {
            var type when type == typeof(UnauthorizedException) => new UnauthorizedException(),
            var type when type == typeof(ForbiddenException) => new ForbiddenException("forbidden"),
            var type when type == typeof(ValidationException) => new ValidationException("invalid"),
            var type when type == typeof(NotFoundException) => new NotFoundException("missing"),
            var type when type == typeof(RoleConflictException) => new RoleConflictException("conflict"),
            var type when type == typeof(IdempotencyConflictException) =>
                new IdempotencyConflictException("conflict"),
            _ => throw new InvalidOperationException("Unexpected exception type."),
        };

        ApiExceptionMapper.TryMap(exception, out ApiError error);

        Assert.Equal(expectedStatus, error.Status);
    }

    [Fact]
    public void DbUpdateException_WithUniqueConstraint_MapsToConflict()
    {
        ApiExceptionMapper.TryMap(
            new DbUpdateException(
                "database constraint details",
                new PostgresException("duplicate", "ERROR", "ERROR", "23505")),
            out ApiError error);

        Assert.Equal(409, error.Status);
        Assert.DoesNotContain("database constraint details", error.Detail);
    }

    [Fact]
    public void DbUpdateException_WithNestedConnectivityFailure_MapsToUnavailable()
    {
        Exception exception = new DbUpdateException(
            "database details",
            new InvalidOperationException(
                "provider details",
                new NpgsqlException("connection details")));

        ApiExceptionMapper.TryMap(exception, out ApiError error);

        Assert.Equal(503, error.Status);
        Assert.DoesNotContain("database details", error.Detail);
        Assert.DoesNotContain("connection details", error.Detail);
    }

    [Fact]
    public void DbUpdateException_WithUnknownFailure_MapsToGenericServerError()
    {
        ApiExceptionMapper.TryMap(
            new DbUpdateException("unknown database details"),
            out ApiError error);

        Assert.Equal(500, error.Status);
        Assert.Equal("Internal Server Error", error.Title);
        Assert.DoesNotContain("unknown database details", error.Detail);
    }

    [Fact]
    public void NpgsqlConnectivityFailure_MapsToUnavailable()
    {
        ApiExceptionMapper.TryMap(new NpgsqlException("connection details"), out ApiError error);

        Assert.Equal(503, error.Status);
        Assert.DoesNotContain("connection details", error.Detail);
    }

    [Fact]
    public void NestedPostgresConstraintFailure_MapsToConflict()
    {
        Exception exception = new DbUpdateException(
            "database details",
            new InvalidOperationException(
                "provider details",
                new PostgresException("duplicate", "ERROR", "ERROR", "23505")));

        ApiExceptionMapper.TryMap(exception, out ApiError error);

        Assert.Equal(409, error.Status);
        Assert.DoesNotContain("duplicate", error.Detail);
    }

    [Fact]
    public void UnknownException_MapsToSafeInternalServerError()
    {
        ApiExceptionMapper.TryMap(new InvalidOperationException("secret SQL and stack details"), out ApiError error);

        Assert.Equal(500, error.Status);
        Assert.Equal("Internal Server Error", error.Title);
        Assert.DoesNotContain("secret SQL and stack details", error.Detail);
    }
}
