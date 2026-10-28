import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {getSavedExtensions, saveExtension} from '../lib/tw-saved-extensions';

import ExtensionBrowserTab from '../components/tw-extension-browser-tab/browser-tab.jsx';
import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

const OFFICIAL_GALLERY_URL = 'https://extensions.turbowarp.org/generated-metadata/extensions-v0.json';
const OFFICIAL_GALLERY_ROOT = 'https://extensions.turbowarp.org/';

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: (extension.nameTranslations && extension.nameTranslations[locale]) || extension.name,
    description: (extension.descriptionTranslations &&
        extension.descriptionTranslations[locale]) || extension.description
});

let cachedOfficialGallery = null;

const fetchOfficialGallery = async () => {
    const response = await fetch(OFFICIAL_GALLERY_URL);
    if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
    }
    const data = await response.json();
    return data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `${OFFICIAL_GALLERY_ROOT}${extension.slug}.js`,
        iconURL: `${OFFICIAL_GALLERY_ROOT}${extension.image || 'images/unknown.svg'}`,
        tags: ['tw'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => credit.name),
        docsURI: extension.docs ? `${OFFICIAL_GALLERY_ROOT}${extension.slug}` : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: true
    }));
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        this.state = {
            officialGallery: cachedOfficialGallery
        };
        bindAll(this, [
            'handleExtensionImported',
            'handleItemSelect',
            'renderTabContent'
        ]);
    }
    componentDidMount () {
        if (!this.state.officialGallery) {
            fetchOfficialGallery()
                .then(officialGallery => {
                    cachedOfficialGallery = officialGallery;
                    this.setState({officialGallery});
                })
                .catch(error => {
                    log.error(error);
                });
        }
    }
    handleExtensionImported () {
        this.forceUpdate();
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
    renderTabContent (selectedTag, filterQuery) {
        if (selectedTag !== 'browser') {
            return null;
        }
        return (
            <ExtensionBrowserTab
                filterQuery={filterQuery}
                onCategorySelected={this.props.onCategorySelected}
                onImported={this.handleExtensionImported}
                vm={this.props.vm}
            />
        );
    }
    render () {
        // Built-in Scratch and TurboWarp extensions, available offline.
        const library = extensionLibraryContent.map(toLibraryItem);

        // Official TurboWarp extensions. In the desktop app these requests are
        // redirected to the bundled tw-extensions:// protocol, so this works
        // without an internet connection.
        if (this.state.officialGallery) {
            const locale = this.props.intl.locale;
            library.push('---');
            library.push(
                ...this.state.officialGallery
                    .filter(extension => extension.extensionId !== 'faceSensing')
                    .map(extension => translateGalleryItem(extension, locale))
                    .map(toLibraryItem)
            );
        }

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
            library.push('---');
            library.push(...savedItems.map(toLibraryItem));
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                keepTagOnFilter
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
                renderTabContent={this.renderTabContent}
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
