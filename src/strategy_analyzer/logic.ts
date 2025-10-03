// src/strategy_analyzer/logic.ts

import { SMA, RSI } from 'technicalindicators';

// Interfaz para la salida de los indicadores
export interface Indicators {
    sma12: number;
    sma26: number;
    rsi14: number;
}

// Interfaz para el objeto de decisión final
export interface Action {
    action: 'BUY' | 'SELL' | 'HOLD';
    asset?: string;
    reason?: string;
}

/**
 * Calcula los indicadores técnicos (SMA, RSI) a partir de una lista de precios de cierre.
 * @param closingPrices Array de precios de cierre.
 * @returns Un objeto con los últimos valores de los indicadores, o null si no hay datos suficientes.
 */
export function calculateIndicators(closingPrices: number[]): Indicators | null {
    // Se necesitan al menos 26 periodos para la SMA más larga.
    if (closingPrices.length < 26) {
        return null;
    }

    const lastSma12 = SMA.calculate({ period: 12, values: closingPrices }).pop()!;
    const lastSma26 = SMA.calculate({ period: 26, values: closingPrices }).pop()!;
    const lastRsi14 = RSI.calculate({ period: 14, values: closingPrices }).pop()!;

    return {
        sma12: lastSma12,
        sma26: lastSma26,
        rsi14: lastRsi14,
    };
}


/**
 * Función principal que analiza un activo y devuelve una decisión de trading y los indicadores calculados.
 * @param closingPrices Los precios de cierre del activo a analizar.
 * @param marketHealthIndex El resultado del filtro de mercado.
 * @returns Un objeto con la decisión final y los indicadores utilizados.
 */
export function runStrategy(closingPrices: number[], marketHealthIndex: number): { decision: Action; indicators: Indicators | null } {
    
    if (marketHealthIndex <= 0) {
        return { 
            decision: { action: 'HOLD', reason: 'Filtro de mercado negativo. Compras deshabilitadas.' },
            indicators: null 
        };
    }

    const indicators = calculateIndicators(closingPrices);

    if (!indicators) {
        return { 
            decision: { action: 'HOLD', reason: 'Datos insuficientes para calcular indicadores.' },
            indicators: null
        };
    }

    const { sma12, sma26, rsi14 } = indicators;
    
    const prevSma12 = SMA.calculate({ period: 12, values: closingPrices.slice(0, -1) }).pop()!;
    const prevSma26 = SMA.calculate({ period: 26, values: closingPrices.slice(0, -1) }).pop()!;

    const isGoldenCross = prevSma12 <= prevSma26 && sma12 > sma26;
    const isRsiOk = rsi14 > 50;

    if (isGoldenCross && isRsiOk) {
        return {
            decision: { action: 'BUY', reason: 'Golden Cross (SMA 12/26) y RSI > 50' },
            indicators: indicators
        };
    }
    
    // --- NUEVO: Lógica de explicación para la decisión de HOLD ---
    let holdReason = 'Condiciones de compra no cumplidas.';
    if (sma12 > sma26) {
        holdReason = 'Tendencia ya alcista, esperando nuevo cruce.';
    } else if (!isRsiOk) {
        holdReason = `RSI por debajo de 50 (${rsi14.toFixed(2)}), sin fuerza suficiente.`;
    } else {
        holdReason = 'SMA 12 por debajo de SMA 26, esperando cruce.';
    }
    
    return {
        decision: { action: 'HOLD', reason: holdReason },
        indicators: indicators
    };
}