export interface PPDashboardPersonDto {
  personId: string;
  fullName: string;
  department: { id: string; label: string } | null;
  projects: string[];
  leaveStatus: string | null;
}

export interface PPDashboardMetadataResponseDto {
  people: PPDashboardPersonDto[];
}
