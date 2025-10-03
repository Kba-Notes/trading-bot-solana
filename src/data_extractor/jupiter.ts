import 'dotenv/config';
import axios from 'axios';

/**
 * Obtiene el precio más reciente de un par de tokens usando el endpoint /quote de Júpiter.
 * @param inputMint La dirección del token de entrada.
 * @param outputMint La dirección del token de salida.
 * @returns El precio actual o null si hay un error.
 */
export async function getCurrentPrice(inputMint: string, outputMint: string): Promise<number | null> {
    try {
        const amount = (inputMint === 'So11111111111111111111111111111111111111112') ? 1000000000 : 1000000;
        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
        
        const response = await axios.get(url);
        
        const data = response.data;
        if (data && data.outAmount) {
            const price = parseInt(data.outAmount) / 1000000;
            return price;
        }
        console.error("No se encontró el precio en la respuesta de la API de Júpiter Quote");
        return null;
    } catch (error) {
        console.error("Error al obtener el precio actual:", error);
        return null;
    }
}

/**
 * Obtiene una serie de precios de cierre históricos usando el endpoint permitido por el plan gratuito de Birdeye.
 * @param mint La dirección del token que queremos analizar.
 * @param timeframe El marco de tiempo de las velas.
 * @param limit La cantidad de precios de cierre a obtener.
 * @returns Un array de números (precios de cierre) o un array vacío si hay error.
 */
export async function getHistoricalData(mint: string, timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', limit: number): Promise<number[]> {
    try {
        const tenDaysAgo = Math.floor((Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000);
        const now = Math.floor(Date.now() / 1000);

        const url = `https://public-api.birdeye.so/defi/history_price?address=${mint}&address_type=token&type=${timeframe.toUpperCase()}&time_from=${tenDaysAgo}&time_to=${now}`;
        
        const headers = {'X-API-KEY': process.env.BIRDEYE_API_KEY};
        const response = await axios.get(url, { headers });
        
        if (response.data && response.data.data.items) {
            // Extraemos únicamente el precio de cierre ('value') de cada item.
            return response.data.data.items.map((item: any) => item.value).slice(-limit);
        }
        return [];
    } catch (error) {
        console.error("Error al obtener datos históricos:", error);
        return [];
    }
}