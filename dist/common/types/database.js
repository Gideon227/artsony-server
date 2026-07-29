"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
exports.Constants = {
    public: {
        Enums: {
            artwork_availability: ["available", "sold", "reserved", "not_for_sale"],
            artwork_category: [
                "painting",
                "digital",
                "photography",
                "sculpture",
                "illustration",
                "mixed_media",
                "print",
                "other",
            ],
            artwork_format: ["DIGITAL", "PHYSICAL"],
            artwork_media_type: ["IMAGE", "VIDEO", "THREE_D", "EXTERNAL_LINK"],
            artwork_status: ["DRAFT", "PUBLISHED", "ARCHIVED", "UNDER_REVIEW", "PAUSED"],
            artwork_visibility: ["PUBLIC", "PRIVATE", "UNLISTED"],
            auth_provider: ["local", "google", "facebook"],
            conversation_type: ["direct", "broadcast"],
            listing_type: ["MARKETPLACE", "PORTFOLIO"],
            message_type: ["text", "image", "system"],
            moderation_status: ["PENDING", "APPROVED", "REJECTED", "FLAGGED"],
            notification_type: [
                "like",
                "comment",
                "follow",
                "mention",
                "reply",
                "sale",
                "system",
                "message",
                "broadcast",
            ],
            order_status: [
                "PENDING_PAYMENT",
                "PAYMENT_CONFIRMED",
                "PROCESSING",
                "SHIPPED",
                "FULFILLED",
                "COMPLETED",
                "CANCELLED",
                "REFUNDED",
            ],
            participant_role: ["owner", "member"],
            seller_registration_status: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
            transaction_status: [
                "PENDING",
                "CONFIRMING",
                "CONFIRMED",
                "FAILED",
                "EXPIRED",
            ],
            user_role: ["USER", "ARTIST", "MODERATOR", "ADMIN"],
            user_status: ["ACTIVE", "SUSPENDED", "DELETED"],
            wallet_ledger_entry_type: ["CREDIT", "DEBIT"],
            wallet_network: ["TRON", "ETHEREUM", "BSC"],
        },
    },
};
//# sourceMappingURL=database.js.map