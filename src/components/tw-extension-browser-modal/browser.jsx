import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import Modal from '../modal/modal.jsx';

import styles from './browser.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Browser extensions',
        description: 'Title for extension browser modal',
        id: 'tw.extensionBrowser.title'
    }
});

const BrowserModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.title)}
        onRequestClose={props.onRequestClose}
    >
        <div className={styles.body}>
            <iframe
                className={styles.iframe}
                src="https://123asxcqasdc.github.io/turbowarp-extensions/?uliblock=1"
                title="Extension Browser"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    </Modal>
);

BrowserModal.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func.isRequired
};

export default injectIntl(BrowserModal);
