using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Persistence;

/// <summary>
/// Proves <see cref="EfRelationshipRepository"/> -- the only production implementation of
/// <see cref="AccessControlService.Domain.IRelationshipRepository"/> -- against a real, ephemeral
/// Postgres instance with the actual EF Core migration applied, not a fake/in-memory provider.
/// This is the test the spec's review loopback added: <c>AccessRoleResolverTests</c> only ever
/// exercises a hand-written fake, so it cannot catch a bug in the real EF Core query translation
/// (a swapped column, a wrong table, a mapping error). This class is the only thing that actually
/// proves "the seed data is present and queryable" -- previously verified solely by a manual
/// <c>psql</c> check, which <c>dotnet test</c> never ran.
/// </summary>
public sealed class EfRelationshipRepositoryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private AccessControlDbContext _dbContext = null!;
    private EfRelationshipRepository _repository = null!;

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresContainer.GetConnectionString())
            .Options;

        _dbContext = new AccessControlDbContext(options);

        // Applies the actual, committed EF Core migration (schema + FixtureSeedData HasData seed)
        // against this real, ephemeral instance -- exactly what a real deployment runs, not a
        // hand-rolled schema-creation shortcut like EnsureCreated().
        await _dbContext.Database.MigrateAsync();

        _repository = new EfRelationshipRepository(_dbContext);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task GetManagerIdAsync_KnownPersonWithManager_ReturnsSeededManagerId()
    {
        var managerId = await _repository.GetManagerIdAsync(FixtureSeedData.EngineerId);

        Assert.Equal(FixtureSeedData.PlatformLeadId, managerId);
    }

    [Fact]
    public async Task GetManagerIdAsync_SeededPersonWithNoManager_ReturnsNull()
    {
        var managerId = await _repository.GetManagerIdAsync(FixtureSeedData.ExecutiveId);

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetManagerIdAsync_UnknownPersonId_ReturnsNull()
    {
        // An id that matches no seeded row currently resolves the same as a known person with no
        // manager -- documented, tracked ambiguity (see this service's CLAUDE.md Gotchas), not a
        // crash. This test pins that current behavior so a future change to it is deliberate.
        var managerId = await _repository.GetManagerIdAsync(Guid.NewGuid());

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetDepartmentIdAsync_KnownPerson_ReturnsSeededDepartmentId()
    {
        var departmentId = await _repository.GetDepartmentIdAsync(FixtureSeedData.EngineerId);

        Assert.Equal(FixtureSeedData.PlatformDepartmentId, departmentId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_DepartmentWithManager_ReturnsSeededManagerId()
    {
        var managerId = await _repository.GetDepartmentManagerIdAsync(FixtureSeedData.PlatformDepartmentId);

        Assert.Equal(FixtureSeedData.PlatformLeadId, managerId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_UnknownDepartmentId_ReturnsNull()
    {
        var managerId = await _repository.GetDepartmentManagerIdAsync(Guid.NewGuid());

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_ChildDepartment_ReturnsSeededParentId()
    {
        var parentId = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.PlatformDepartmentId);

        Assert.Equal(FixtureSeedData.EngineeringDepartmentId, parentId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_RootDepartment_ReturnsNull()
    {
        var parentId = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.HeadquartersDepartmentId);

        Assert.Null(parentId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_GrandchildDepartment_WalkedTwoHopsUp_ReachesRoot()
    {
        // Proves the full 3-level fixture hierarchy is actually persisted and queryable, not just
        // the first parent hop: Platform -> Engineering -> Headquarters (root).
        var parentOfPlatform = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.PlatformDepartmentId);
        Assert.Equal(FixtureSeedData.EngineeringDepartmentId, parentOfPlatform);

        var parentOfEngineering = await _repository.GetParentDepartmentIdAsync(parentOfPlatform!.Value);
        Assert.Equal(FixtureSeedData.HeadquartersDepartmentId, parentOfEngineering);

        var parentOfHeadquarters = await _repository.GetParentDepartmentIdAsync(parentOfEngineering!.Value);
        Assert.Null(parentOfHeadquarters);
    }
}
