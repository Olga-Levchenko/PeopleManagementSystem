export interface DMPMDashboardPersonDto {
  personId: string;
  fullName: string;
  department: { id: string; label: string } | null;
  leaveStatus: string | null;
}

export interface DMPMDashboardProjectDto {
  projectId: string;
  projectLabel: string;
  people: DMPMDashboardPersonDto[];
}

export interface DMPMDashboardMetadataResponseDto {
  projects: DMPMDashboardProjectDto[];
}
