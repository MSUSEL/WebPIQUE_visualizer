// Data parser to extract information from PIQUE json output
export interface ProductFactor {
    name: string;
    value: number;
    description: string;
    type: string;
    aspect: string;
    measures: {
        name: string;
        description: string;
    }[];
}

export interface ParsedScore {
    tqiScore: number;
    aspects: { name: string; value: number }[];
    productFactorsByAspect: ProductFactorsByAspect;
};


export interface ProductFactorsByAspect {
    [aspectName: string]: ProductFactor[];
}

export function parsePIQUEJSON(json: any): {
    scores: ParsedScore;
    productFactorsByAspect: ProductFactorsByAspect;
} {
    const measuresRaw = json.factors.measures || {};
    const qualityAspectsRaw = json.factors.quality_aspects || {};
    const productFactorsRaw = json.factors.product_factors || {};

    const tqiRaw = json.factors?.tqi;
    const tqiNode = tqiRaw ? Object.values(tqiRaw)[0] : null;

    let tqiScore = 0;
    if (tqiNode && typeof (tqiNode as any).value === 'number') {
        tqiScore = (tqiNode as any).value;
    }

    const aspects = Object.entries(qualityAspectsRaw).map(([aspectName, aspectData]: any) => ({
        name: aspectName,
        value: typeof aspectData?.value === 'number' ? aspectData.value : 0,
    }));

    const productFactorsByAspect: ProductFactorsByAspect = {};

    for (const [aspectName, rawData] of Object.entries(qualityAspectsRaw)) {
        const aspectData = rawData as { value: number; children?: unknown };
        const children: string[] = Array.isArray(aspectData.children) ? aspectData.children as string[] : [];


        const pfList: ProductFactor[] = [];

        for (const pfKey of children) {
            const pfName = pfKey as string;
            const pfData = productFactorsRaw[pfName];
            if (pfData) {
                const cleanName = pfName.replace(/^Product_Factor:/, '');
                let type: string | undefined = undefined;

                // Extract measures
                const measures: { name: string; description: string }[] = [];
                if (Array.isArray(pfData.children)) {
                    for (const measureKey of pfData.children) {
                        const measureName = measureKey as string;
                        const measureData = measuresRaw[measureName];
                        if (measureData) {
                            measures.push({
                                name: measureName.replace(/^Measure:/, ''),
                                description: measureData.description ?? '',
                            });
                        }
                    }
                }

                pfList.push({
                    name: pfName as string,
                    value: pfData.value ?? 0,
                    description: pfData.description ?? '',
                    measures: Array.isArray(pfData.children)
                        ? (pfData.children as string[]).map((measureName: string) => {
                            const measureData = measuresRaw[measureName];
                            return {
                                name: measureName,
                                description: measureData?.description ?? '',
                            };
                        })
                        : [],
                    type,
                    aspect: aspectName,
                } as any);
            }
        }

        productFactorsByAspect[aspectName] = pfList;
    }

    return {
        scores: {
            tqiScore,
            aspects,
            productFactorsByAspect,
        },
        productFactorsByAspect,
    };
}


