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
	adSpendPerMonth: number | null;
	paidAdsGoLiveDate: string | null;
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

export type MonthlyMetricValueType = "integer" | "percent" | "text";
export type MonthlyMetricSource = "manual" | "hubspot";

export type MonthlyMetric = {
	id: string;
	key: string;
	label: string;
	valueType: MonthlyMetricValueType;
	minValue: number | null;
	maxValue: number | null;
	source: MonthlyMetricSource;
	sortOrder: number;
	active: boolean;
};

/** One cell: a single metric's value for a single client+month. */
export type MonthlyDataValue = {
	id: string;
	clientId: string;
	metricId: string;
	month: string; // YYYY-MM-DD, always first-of-month
	value: number | null;
	valueText: string | null;
	updatedBy: string | null;
	updatedAt: string;
};

/** Same shape as Monthly Data's metric/value tables (PRD §11) — aliased, not duplicated. */
export type PaidAdsMetric = MonthlyMetric;
export type PaidAdsDataValue = MonthlyDataValue;

export type CommentSection = "monthly_data" | "paid_ads";

export type Comment = {
	id: string;
	clientId: string;
	section: CommentSection;
	month: string;
	body: string;
	createdBy: string;
	updatedBy: string | null;
	createdAt: string;
	updatedAt: string;
};
