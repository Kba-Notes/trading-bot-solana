import axios from 'axios';
import 'dotenv/config';

const PENG_MINT = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';

async function investigatePengData() {
    console.log(`--- Iniciando investigación de datos para PENG ---`);

    try {
        const tenDaysAgo = Math.floor((Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000);
        const now = Math.floor(Date.now() / 1000);
        const timeframe = '4h';
        
        const url = `https://public-api.birdeye.so/defi/history_price?address=${PENG_MINT}&address_type=token&type=${timeframe.toUpperCase()}&time_from=${tenDaysAgo}&time_to=${now}`;
        
        console.log(`URL de la API que se está llamando:`);
        console.log(url);

        const headers = {'X-API-KEY': process.env.BIRDEYE_API_KEY};
        
        const response = await axios.get(url, { headers });

        console.log('\n--- Respuesta CRUDA de la API de Birdeye ---');
        
        if (response.data && response.data.data && response.data.data.items) {
            const items = response.data.data.items;
            console.log(`✅ Éxito: La API ha devuelto un total de ${items.length} velas (puntos de datos).`);
            
            if (items.length > 0) {
                console.log('\nÚltimo punto de dato recibido:');
                console.log(items[items.length - 1]);
            }

        } else {
            console.log('❌ La respuesta de la API no tiene el formato esperado o está vacía.');
            console.log('Respuesta completa recibida:', JSON.stringify(response.data, null, 2));
        }

    } catch (error: any) {
        console.error("\n💥 ERROR durante la llamada a la API:", error.message);
        if (error.response) {
            console.error('Código de estado:', error.response.status);
            console.error('Datos del error:', JSON.stringify(error.response.data, null, 2));
        }
    } finally {
        console.log('\n--- Investigación finalizada ---');
    }
}

investigatePengData();