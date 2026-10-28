import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {getSavedExtensions, saveExtension} from '../lib/tw-saved-extensions';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

const ULIBLOCK_BROWSER_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/?uliblock=1';

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleTagClick'
        ]);
    }
    handleOpenBrowser () {
        const browserWindow = window.open(
            ULIBLOCK_BROWSER_URL,
            'uliblock-extension-browser',
            'width=1200,height=850,minWidth=800,minHeight=600'
        );
        if (browserWindow) {
            browserWindow.focus();
        }
    }
    handleTagClick (tag) {
        if (tag.toLowerCase() === 'browser') {
            this.handleOpenBrowser();
            this.props.onRequestClose();
            return true;
        }
        return false;
    }
    handleItemSelect (item) {
        if (item.href) {
            window.open(item.href);
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (!item.disabled) {
            if (extensionId && this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
                this.props.onCategorySelected(extensionId);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url)
                    .then(() => {
                        try {
                            saveExtension({
                                name: item.name,
                                url: url,
                                type: item.fromGallery || item.gallery ? 'gallery' : 'custom',
                                tags: (item.tags || []).includes('saved') ? item.tags : [...(item.tags || []), 'saved'],
                                iconURL: item.iconURL || null
                            });
                        } catch (e) {
                            // ignore
                        }
                        let loadedId = extensionId;
                        if (!loadedId) {
                            // Catalogue entry had no registered id: ask the VM
                            // which extension was just loaded from this URL.
                            const loaded = this.props.vm.extensionManager.loadedExtensions;
                            if (loaded && typeof loaded.entries === 'function') {
                                for (const [id, loadedUrl] of loaded.entries()) {
                                    if (loadedUrl === url) {
                                        loadedId = id;
                                        break;
                                    }
                                }
                            }
                        }
                        if (loadedId) {
                            this.props.onCategorySelected(loadedId);
                        }
                    })
                    .catch(err => {
                        log.error(err);
                        // eslint-disable-next-line no-alert
                        alert(err);
                    });
            }
        }
    }
    render () {
        // Built-in Scratch and TurboWarp extensions, available offline.
        const library = extensionLibraryContent.map(toLibraryItem);
        library.push('---');

        // Saved extensions (loaded from a URL, file or the extension browser).
        const saved = getSavedExtensions();
        if (saved.length > 0) {
            const savedItems = saved.map(item => ({
                name: item.name || item.url,
                extensionId: item.url,
                extensionURL: item.url,
                iconURL: item.iconURL || extensionIcon,
                description: item.url,
                tags: ['saved'],
                featured: true
            }));
            library.push(...savedItems.map(toLibraryItem));
            library.push('---');
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
                onTagClick={this.handleTagClick}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
