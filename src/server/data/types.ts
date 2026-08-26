import type { IconName } from "../../components/icons/icon-names";

export type Status = {
	id: string;
	name: string;
	description: string | null;
	icon: IconName;
	colorLine: string;
	colorText: string;
	colorTint: string;
	colorHalo: string;
	sortOrder: number;
	active: boolean;
};

export type Csm = {
	id: string;
	name: string;
	email: string | null;
	active: boolean;
};

export type StateRef = {
	code: string;
	name: string;
	sortOrder: number;
};

export type ClientRow = {
	id: string;
	name: string;
	website: string | null;
	population: number | null;
	domainAuthority: number | null;
	legalStatus: string | null;
	stateCode: string | null;
	csm: Csm | null;
	status: Status;
	hubspotCompanyId: string | null;
	hubspotSyncStatus: "synced" | "error" | "unmatched" | null;
	hubspotSyncedAt: string | null;
	generalNotes: string | null;
	generalNotesUpdatedAt: string | null;
	generalNotesUpdatedBy: string | null;
};

export type ClientFilters = {
	csmId?: string;
	statusId?: string;
	stateCode?: string;
};

export const CHANGE_CATEGORIES = ["Contract", "Contact", "Scope", "Other"] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export type Change = {
	id: string;
	clientId: string;
	changeDate: string;
	description: string;
	category: ChangeCategory | null;
	source: "manual" | "system";
	createdBy: string;
	createdAt: string;
};

export type Link = {
	id: string;
	clientId: string;
	title: string;
	url: string;
	description: string | null;
	category: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};
