export type StaffDepartureStatus = 'planned' | 'completed' | 'cancelled';

export type StaffDepartureRow = {
  id: string;
  organization_id: string;
  staff_id: string;
  departure_date: string;
  note: string | null;
  status: StaffDepartureStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffDepartureListItem = StaffDepartureRow & {
  staff_name: string | null;
  staff_department: string | null;
  staff_role: string | null;
  creator_name: string | null;
};

export type CreateStaffDepartureInput = {
  organizationId: string;
  staffId: string;
  departureDate: string;
  note?: string | null;
  createdByStaffId: string;
};

export type UpdateStaffDepartureInput = {
  id: string;
  departureDate?: string;
  note?: string | null;
  status?: StaffDepartureStatus;
  updatedByStaffId: string;
};

export type BulkCreateStaffDepartureInput = {
  organizationId: string;
  staffIds: string[];
  departureDate: string;
  note?: string | null;
  createdByStaffId: string;
};
