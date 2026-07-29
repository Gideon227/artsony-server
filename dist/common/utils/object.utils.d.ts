export declare function compact<T extends Record<string, unknown>>(obj: T): {
    [K in keyof T]?: Exclude<T[K], undefined>;
};
//# sourceMappingURL=object.utils.d.ts.map