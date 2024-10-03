/* istanbul ignore file */

import {existsSync, readFileSync, renameSync, writeFileSync} from 'fs';
import {createServer} from 'http';
import {parse} from 'querystring';

import {SerialPort} from 'zigbee-herdsman/dist/adapter/serialPort';

import data from './data';

const CONFIG_FILE = data.joinPath('configuration.yaml');

const buildPortSelectHTML = async (): Promise<string> => {
    try {
        let html = `<select name="serial:port" id="serial-port">`;
        const portList = await SerialPort.list();

        if (portList.length === 0) {
            throw new Error(`No USB adapter found`);
        }

        for (const portInfo of portList) {
            let label = portInfo.vendorId ? `${portInfo.vendorId}:${portInfo.productId} - ` : '';
            label += portInfo.path;
            html += `<option value="${portInfo.path}">${label}</option>`;
        }

        html += `</select>`;

        return html;
    } catch {
        return `<input type="text" name="serial:port" id="serial-port" placeholder="/dev/serial/by-id/<usb-id> or tcp://<host>:<port> or mdns://<device>">`;
    }
};

const onboard = async (): Promise<void> => {
    // TODO handle upload of `coordinator_backup.json`, `configuration.yaml, `database.db`, `state.json` from a backup
    // TODO handle migration from adapter A to adapter B, same or across stacks
    console.log(`Starting onboarding process...`);

    const portSelectHTML = await buildPortSelectHTML();
    const result = await new Promise<string>((resolve, reject) => {
        const server = createServer((req, res): void => {
            if (req.method === 'POST') {
                let body = '';

                req.on('data', (chunk) => {
                    body += chunk.toString();

                    if (body.length > 1e6) {
                        req.socket.destroy();
                        reject(new Error(`POST data overflow`));
                    }
                });
                req.on('end', () => {
                    res.end('End of onboarding. You can close this page.');
                    server.close((err) => (err ? reject(err) : resolve(body)));
                });
            } else {
                const htmlContent = readFileSync(data.joinPath('onboarding.html'), 'utf-8').replace('<PortSelect />', portSelectHTML);

                res.setHeader('Content-Type', 'text/html');
                res.writeHead(200);
                res.end(htmlContent);
            }
        });

        server.listen(8080);
    });

    const settings = parse(result);

    if (!settings['serial:port']) {
        throw new Error(`serial>port cannot be empty`);
    }

    const yaml = `
mqtt:
  base_topic: ${settings['mqtt:base_topic']}
  server: ${settings['mqtt:server']}
serial:
  port: ${settings['serial:port']}
  adapter: ${settings['serial:adapter']}
  baudrate: ${settings['serial:baudrate']}
advanced:
  log_level: ${settings['advanced:log_level']}
  pan_id: ${settings['advanced:pan_id'] || 0x1a62}
  ext_pan_id: ${settings['advanced:ext_pan_id'] || [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd]}
  network_key: ${settings['advanced:network_key'] || [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13]}
  channel: ${settings['advanced:channel']}
  transmit_power: ${settings['advanced:transmit_power']}
frontend: ${settings.frontend === 'on' ? 'true' : 'false'}
homeassistant: ${settings.homeassistant === 'on' ? 'true' : 'false'}
`;

    if (existsSync(CONFIG_FILE)) {
        renameSync(CONFIG_FILE, `${CONFIG_FILE}.bak`);
    }

    writeFileSync(CONFIG_FILE, yaml);
};

export const check = async (force: boolean): Promise<void> => {
    if (force || !existsSync(CONFIG_FILE)) {
        await onboard();
    }
};
