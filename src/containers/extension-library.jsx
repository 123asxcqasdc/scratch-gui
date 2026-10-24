import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {getSavedExtensions} from '../lib/tw-saved-extensions';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

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
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});

let cachedGallery = null;

// UliBlock: gallery comes from the user's own catalogue
// (https://github.com/123asxcqasdc/turbowarp-extensions). Clicking a card
// imports the extension into the project via loadExtensionURL() in
// handleItemSelect below -- there is intentionally no "download .js" step.
const ULIBLOCK_GALLERY_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/extensions.json';

const pickBestVariant = variants => (
    variants.find(v => !v.deprecated && v.source === 'official') ||
    variants.find(v => !v.deprecated) ||
    variants[0]
);

const fetchLibrary = async () => {
    try {
        const res = await fetch(ULIBLOCK_GALLERY_URL);
        if (!res.ok) {
            throw new Error(`HTTP status ${res.status}`);
        }
        const data = await res.json();
        return (data.extensions || [])
            .map(extension => {
                const variants = (extension.variants || []).filter(v => v && v.url);
                if (!variants.length) {
                    return null;
                }
                const best = pickBestVariant(variants);
                const knownVariant = variants.find(v => v.ext_id);
                const category = extension.category || 'other';
                const tags = ['tw'];
                if (category === 'network' || best.tags?.includes('network')) tags.push('network');
                if (category === 'skinning' || category === 'skins' || category === 'costumes') tags.push('skins');
                if (category === 'hardware') tags.push('hardware');
                if (category === 'utility' || category === 'utilities') tags.push('utilities');
                return {
                    name: extension.name,
                    nameTranslations: {},
                    description: extension.description || best.description || '',
                    descriptionTranslations: {},
                    // May be unknown for a few catalogue entries; handleItemSelect
                    // resolves the real id from the VM after loading in that case.
                    extensionId: best.ext_id || (knownVariant && knownVariant.ext_id) || null,
                    extensionURL: best.url,
                    iconURL: best.image || extension.image || null,
                    tags: tags,
                    credits: [
                        best.source_label || best.source,
                        extension.author,
                        best.author
                    ].filter((credit, index, all) => credit && all.indexOf(credit) === index),
                    docsURI: best.documentation || null,
                    samples: null,
                    incompatibleWithScratch: best.source !== 'official',
                    featured: true
                };
            })
            .filter(Boolean);
    } catch (e) {
        throw e;
    }
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false
        };
    }
    componentDidMount () {
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }
    }
    handleItemSelect (item) {
        if (item.href) {
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
        const library = [];
        library.push(...extensionLibraryContent.map(toLibraryItem));
        library.push('---');
        
        // Saved extensions tab
        const saved = getSavedExtensions();
        if (saved.length > 0) {
            const savedItems = saved.map(item => ({
                name: item.name || item.url,
                extensionId: item.url,
                extensionURL: item.url,
                iconURL: extensionIcon,
                description: item.url,
                tags: item.tags || ['saved'],
                featured: true
            }));
            library.push(...savedItems.map(toLibraryItem));
            library.push('---');
        }
        
        if (this.state.gallery) {
            library.push(toLibraryItem(galleryMore));
            const locale = this.props.intl.locale;
            library.push(
                ...this.state.gallery
                    .filter(i => i.extensionId !== 'faceSensing')
                    .map(i => translateGalleryItem(i, locale))
                    .map(toLibraryItem)
            );
        } else if (this.state.galleryError) {
            // Offline - still show saved extensions, but don't fail completely
            library.push(toLibraryItem(galleryError));
        } else {
            library.push(toLibraryItem(galleryLoading));
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
