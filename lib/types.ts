export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type ConnectedAccount = {
  workspaceId: string;
  id: string;
  email: string;
  name: string;
  picture?: string;
  token: StoredToken;
  connectedAt: string;
};

export type PublicAccount = Omit<ConnectedAccount, "token" | "workspaceId"> & {
  storage: { limit: number | null; usage: number; usageInDrive: number; usageInTrash: number };
};

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
  iconLink?: string;
  md5Checksum?: string;
  ownedByMe?: boolean;
  shared?: boolean;
  sharedWithMeTime?: string;
  driveId?: string;
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
  capabilities?: { canDownload?: boolean; canTrash?: boolean; canDelete?: boolean; canCopy?: boolean; canEdit?: boolean; canRemoveMyDriveParent?: boolean };
};
