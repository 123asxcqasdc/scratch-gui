import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';

import log from '../lib/log';
import {saveExtension} from '../lib/tw-saved-extensions';

const REPLY_TYPE = 'uliblock:extension-result';

const toDataURL = source => (
    `data:application/javascript;charset=utf-8,${encodeURIComponent(source)}`
);

class TWExtensionImportListener extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleMessage'
        ]);
    }
    componentDidMount () {
        window.addEventListener('message', this.handleMessage);
    }
    componentWillUnmount () {
        window.removeEventListener('message', this.handleMessage);
    }
    reply (source, data) {
        if (!source) return;
        try {
            source.postMessage(data, '*');
        } catch (e) {
            // The browser window may already be closed.
        }
    }
    handleMessage (event) {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.type !== 'uliblock:add-extension') {
            return;
        }
        if (!data.url || typeof data.url !== 'string') {
            return;
        }

        const requestId = data.requestId;
        const name = data.name || data.url;
        const source = typeof data.source === 'string' && data.source.length > 0 ?
            data.source :
            null;
        const loadURL = source ? toDataURL(source) : data.url;

        this.props.vm.extensionManager.loadExtensionURL(loadURL)
            .then(() => {
                try {
                    saveExtension({
                        name: name,
                        url: data.url,
                        type: 'gallery',
                        tags: ['saved', 'gallery'],
                        iconURL: data.image || null
                    });
                } catch (e) {
                    // Saving is best-effort; the extension is already loaded.
                }
                this.reply(event.source, {
                    type: REPLY_TYPE,
                    requestId: requestId,
                    ok: true
                });
            })
            .catch(error => {
                log.error(error);
                this.reply(event.source, {
                    type: REPLY_TYPE,
                    requestId: requestId,
                    ok: false,
                    error: (error && (error.message || String(error))) || 'unknown error'
                });
            });
    }
    render () {
        return null;
    }
}

TWExtensionImportListener.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default TWExtensionImportListener;
