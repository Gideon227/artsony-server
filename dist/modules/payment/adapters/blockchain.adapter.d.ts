import type { WalletNetwork } from '../../../common/types/commerce.types';
export type VerifyResult = {
    confirmed: true;
    block: number;
    amount: number;
    recipient: string;
} | {
    confirmed: false;
    reason: 'NOT_FOUND' | 'PENDING' | 'WRONG_RECIPIENT' | 'WRONG_AMOUNT' | 'FAILED' | 'RETRYABLE';
};
export interface BlockchainAdapter {
    verifyTransaction(txHash: string, expectedAmountUsdt: number, recipientAddress: string): Promise<VerifyResult>;
}
export declare class TronAdapter implements BlockchainAdapter {
    verifyTransaction(txHash: string, expectedAmountUsdt: number, recipientAddress: string): Promise<VerifyResult>;
}
export declare class EthereumAdapter implements BlockchainAdapter {
    verifyTransaction(txHash: string, expectedAmountUsdt: number, recipientAddress: string): Promise<VerifyResult>;
}
export declare class BscAdapter implements BlockchainAdapter {
    verifyTransaction(txHash: string, expectedAmountUsdt: number, recipientAddress: string): Promise<VerifyResult>;
}
export declare function getBlockchainAdapter(network: WalletNetwork): BlockchainAdapter;
//# sourceMappingURL=blockchain.adapter.d.ts.map