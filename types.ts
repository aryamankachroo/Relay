export type TimeWindow = {
    start: number;
    end: number;
};
export type Kind = 'loan' | 'gift';
export type Resident = {
    id: string;
    name: string;
    zone: number;
    owned: string[];
};
export type Item = {
    id: string;
    owner: string;
    catalogId: string;
    quantity: number;
    windows: TimeWindow[];
    willingToLend: boolean;
    kind: Kind;
    notes: string;
};
export type Request = {
    id: string;
    type: 'need' | 'offer';
    userId: string;
    catalogId: string;
    quantity: number;
    zone: number;
    window: TimeWindow;
    status: 'open' | 'matched' | 'completed';
    kind: Kind;
    declinedOwners: string[];
    createdAt: number;
};
export type ExchangeStatus = 'Requested' | 'Confirmed' | 'Picked up' | 'Returned' | 'Received' | 'Declined';
export type Exchange = {
    id: string;
    item: string;
    catalogId: string;
    quantity: number;
    giver: string;
    receiver: string;
    requestId: string;
    window: TimeWindow;
    status: ExchangeStatus;
    kind: Kind;
    giverConfirmed: boolean;
    receiverConfirmed: boolean;
    offerId?: string;
};
export type GroupBuy = {
    id: string;
    catalogId: string;
    requests: string[];
    members: string[];
    accepted: string[];
    declined: string[];
    slots: {
        id: string;
        window: TimeWindow;
    }[];
    status: 'proposed' | 'started' | 'declined';
};
export type Pending = {
    type: 'exchange';
    id: string;
} | {
    type: 'group';
    id: string;
};
export type Notification = {
    userId: string;
    text: string;
};
export type ChatResult = {
    type: 'tool_list' | 'match' | 'loan_status' | 'shared_demand' | 'message';
    reply: string;
    notify?: Notification[];
};
export type RelayState = {
    version: 1;
    residents: Resident[];
    items: Item[];
    requests: Request[];
    exchanges: Exchange[];
    groups: GroupBuy[];
    pending: Record<string, Pending[]>;
    spaces: Record<string, string>;
    outbox: {
        id: string;
        userId: string;
        text: string;
    }[];
    delivered: string[];
};
