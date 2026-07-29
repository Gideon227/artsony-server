export declare function validatePasswordComplexity(password: string): void;
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(hash: string, candidate: string): Promise<boolean>;
export declare function needsRehash(hash: string): Promise<boolean>;
//# sourceMappingURL=password.service.d.ts.map