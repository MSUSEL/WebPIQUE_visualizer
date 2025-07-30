// Data parser to extract information from WebPIQUE json output
// The parser works for TQI and Quality Aspects on other PIQUE outputs
// Parser is unique to display WebPIQUE product factors...updata Product Factor section for other PIQUE models
export interface ProductFactor { //this is specific to WebPIQUE
    name: string;
    value: number;
    description: string;
    type: string;
    aspect: string;
    measures: {
        name: string;
        description: string;
        score: number,
        threshold: number[],
    }[];
}

export interface ParsedScore {
    tqiScore: number;
    aspects: { name: string; value: number }[];
    productFactorsByAspect: ProductFactorsByAspect;
    vulnerabilitySummary?: VulnerabilitySummary; //this is specific to WebPIQUE
    cweProductFactors?: ProductFactor[]; //this is specific to WebPIQUE
};


export interface ProductFactorsByAspect {
    [aspectName: string]: ProductFactor[];
}

export interface VulnerabilitySummary { //this is specific to WebPIQUE
    cweCount: number;
    cveCount: number;
}

export function parsePIQUEJSON(json: any): {
    scores: ParsedScore;
    productFactorsByAspect: ProductFactorsByAspect;
} {
    //variables for TQI and quality aspect scores, and product factor infomration
    const tqiRaw = json.factors?.tqi;
    const tqiNode = tqiRaw ? Object.values(tqiRaw)[0] : null;
    const qualityAspectsRaw = json.factors.quality_aspects || {};
    const productFactorsRaw = json.factors.product_factors || {};
    const measuresRaw = json.factors.measures || {};

    //extract and store TQI score
    let tqiScore = 0;
    if (tqiNode && typeof (tqiNode as any).value === 'number') {
        tqiScore = (tqiNode as any).value;
    }

    //extract and store aspect scores
    const aspects = Object.entries(qualityAspectsRaw).map(([aspectName, aspectData]: any) => ({
        name: aspectName,
        value: typeof aspectData?.value === 'number' ? aspectData.value : 0,
    }));

    //extract and store product factor information by aspect
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

                pfList.push({
                    name: pfName as string,
                    aspect: aspectName,
                } as any);
            }
        }

        productFactorsByAspect[aspectName] = pfList;
    }

    //extract CWE product factors
    const cweProductFactors: ProductFactor[] = [];

    for (const [key, pfDataRaw] of Object.entries(json.factors?.product_factors || {})) {
        const pfData = pfDataRaw as {
            value?: number;
            description?: string;
            children?: string[];
        };
        if (key.startsWith("Product_Factor CWE-")) {
            const children = pfData.children;
            const measures: { name: string; description: string; score: number; threshold: number[]; }[] = [];
            const thresholds: number[] = [];

            if (children && typeof children === 'object') {
                for (const [measureKey, measureObj] of Object.entries(children)) {
                    if (typeof measureObj === 'object' && measureObj !== null) {
                        measures.push({
                            name: (measureObj as any).name ?? measureKey,
                            description: (measureObj as any).description ?? '',
                            score: (measureObj as any).value ?? 0,
                            threshold: Array.isArray((measureObj as any).thresholds)
                                ? (measureObj as any).thresholds.map(Number)
                                : [],
                        });
                    }
                }
            }

            cweProductFactors.push({
                name: key,
                value: pfData.value ?? 0,
                description: pfData.description ?? '',
                measures,
                type: 'CWE',
                aspect: '',
            });
        }
    }

    // Extract CWE product factors and CVE counts
    const cweCount = Object.keys(json.factors?.product_factors || {}).filter(key =>
        key.startsWith("Product_Factor CWE-")
    ).length;

    // Recursively traverse diagnostics to extract CVEs
    function collectCVEs(obj: any): Set<string> {
        const found = new Set<string>();
        const stack = [obj];

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || typeof current !== 'object') continue;

            for (const [key, value] of Object.entries(current)) {
                if (key.startsWith("CVE-")) {
                    found.add(key);
                } else if (typeof value === 'object') {
                    stack.push(value);
                }
            }
        }

        return found;
    }

    const allCVEs = collectCVEs(json.factors?.product_factors || {});
    const cveCount = allCVEs.size;

    const vulnerabilitySummary = {
        cweCount,
        cveCount,
    };

    return {
        scores: {
            tqiScore,
            aspects,
            productFactorsByAspect,
            vulnerabilitySummary,
            cweProductFactors,
        },
        productFactorsByAspect,
    };
}


