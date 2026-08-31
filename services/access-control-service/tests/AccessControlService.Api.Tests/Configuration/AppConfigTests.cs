using AccessControlService.Api.Configuration;
using AccessControlService.Api.Tests.Testing;

namespace AccessControlService.Api.Tests.Configuration;

public class AppConfigTests
{
    private static Dictionary<string, string?> ValidValues() => new()
    {
        ["PORT"] = "3007",
        ["CORS_ORIGIN"] = "http://localhost:4200",
        ["ConnectionStrings:Postgres"] = "Host=localhost;Database=access_control_service",
        ["RABBITMQ_HOST"] = "localhost",
        ["RABBITMQ_PORT"] = "5672",
        ["RABBITMQ_USER"] = "guest",
        ["RABBITMQ_PASSWORD"] = "guest",
    };

    [Fact]
    public void Load_WithAllRequiredValues_ReturnsParsedConfig()
    {
        var config = AppConfig.Load(new FakeConfiguration(ValidValues()));

        Assert.Equal(3007, config.Port);
        Assert.Equal("http://localhost:4200", config.CorsOrigin);
        Assert.Equal("Host=localhost;Database=access_control_service", config.PostgresConnectionString);
        Assert.Equal("localhost", config.RabbitMqHost);
        Assert.Equal(5672, config.RabbitMqPort);
        Assert.Equal("guest", config.RabbitMqUser);
        Assert.Equal("guest", config.RabbitMqPassword);
    }

    [Theory]
    [InlineData("PORT", null)]
    [InlineData("PORT", "")]
    [InlineData("PORT", "   ")]
    [InlineData("CORS_ORIGIN", null)]
    [InlineData("CORS_ORIGIN", "")]
    [InlineData("CORS_ORIGIN", "   ")]
    [InlineData("ConnectionStrings:Postgres", null)]
    [InlineData("ConnectionStrings:Postgres", "")]
    [InlineData("ConnectionStrings:Postgres", "   ")]
    [InlineData("RABBITMQ_HOST", null)]
    [InlineData("RABBITMQ_HOST", "")]
    [InlineData("RABBITMQ_HOST", "   ")]
    [InlineData("RABBITMQ_PORT", null)]
    [InlineData("RABBITMQ_PORT", "")]
    [InlineData("RABBITMQ_PORT", "   ")]
    [InlineData("RABBITMQ_USER", null)]
    [InlineData("RABBITMQ_USER", "")]
    [InlineData("RABBITMQ_USER", "   ")]
    [InlineData("RABBITMQ_PASSWORD", null)]
    [InlineData("RABBITMQ_PASSWORD", "")]
    [InlineData("RABBITMQ_PASSWORD", "   ")]
    public void Load_WithMissingOrBlankRequiredValue_ThrowsNamingTheKey(string key, string? blankValue)
    {
        var values = ValidValues();
        values[key] = blankValue;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(new FakeConfiguration(values)));

        Assert.Contains(key, ex.Message);
    }

    [Fact]
    public void Load_WithNonNumericPort_ThrowsClearException_NotFormatException()
    {
        var values = ValidValues();
        values["PORT"] = "not-a-number";

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(new FakeConfiguration(values)));

        Assert.Contains("PORT", ex.Message);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("65536")]
    [InlineData("99999")]
    public void Load_WithOutOfRangePort_ThrowsClearException_NotKestrelBindFailure(string outOfRangePort)
    {
        var values = ValidValues();
        values["PORT"] = outOfRangePort;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(new FakeConfiguration(values)));

        Assert.Contains("PORT", ex.Message);
        Assert.Contains(outOfRangePort, ex.Message);
    }

    [Fact]
    public void Load_WithNonNumericRabbitMqPort_ThrowsClearException_NotFormatException()
    {
        var values = ValidValues();
        values["RABBITMQ_PORT"] = "not-a-number";

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(new FakeConfiguration(values)));

        Assert.Contains("RABBITMQ_PORT", ex.Message);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("65536")]
    public void Load_WithOutOfRangeRabbitMqPort_ThrowsClearException(string outOfRangePort)
    {
        var values = ValidValues();
        values["RABBITMQ_PORT"] = outOfRangePort;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(new FakeConfiguration(values)));

        Assert.Contains("RABBITMQ_PORT", ex.Message);
        Assert.Contains(outOfRangePort, ex.Message);
    }
}
