import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {injectIntl} from 'react-intl';

import BrowserModalComponent from '../components/tw-extension-browser-modal/browser.jsx';

import {closeExtensionBrowser} from '../reducers/modals';
import {saveExtension} from '../lib/tw-saved-extensions';
import VM from 'scratch-vm';

class TWExtensionBrowserModal extends React.PureComponent {
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
    handleMessage (e) {
        const data = e.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'uliblock:add-extension' && data.url) {
            try {
                saveExtension({
                    name: data.name || data.url,
                    url: data.url,
                    type: 'gallery',
                    tags: ['saved', 'gallery'],
                    iconURL: data.image || null
                });
            } catch (err) {
                // ignore
            }
            try {
                this.props.vm.extensionManager.loadExtensionURL(data.url)
                    .then(() => {
                        // optional: switch to category
                    })
                    .catch(err => {
                        // eslint-disable-next-line no-alert
                        alert(err);
                    });
            } catch (err) {
                // eslint-disable-next-line no-alert
                alert(err);
            }
        }
    }
    render () {
        if (!this.props.visible) return null;
        return (
            <BrowserModalComponent
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

TWExtensionBrowserModal.propTypes = {
    onRequestClose: PropTypes.func.isRequired,
    visible: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    visible: state.scratchGui.modals.extensionBrowser,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeExtensionBrowser())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(TWExtensionBrowserModal));
