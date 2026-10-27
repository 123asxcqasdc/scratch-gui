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
                // Add source tags
                if (best.source === 'official') tags.push('official');
                else tags.push('community');
                // Add specific source filters
                if (best.source && best.source !== 'official' && best.source !== 'turbowarp') {
                    const src = best.source.toLowerCase().replace(/_/g, '-');
                    tags.push(`src:${src}`);
                } else if (best.source_label) {
                    const label = best.source_label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    if (label && label !== 'officialnaya-galereya') tags.push(`src:${label}`);
                } else if (best.source) {
                    tags.push(`src:${best.source.toLowerCase()}`);
                }
                
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
                    featured: true,
                    fromGallery: true,
                    gallery: true,
                    source: best.source
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
            'handleItemSelect',
            'handleTagClick'
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
    handleOpenBrowser () {
        const browserUrl = new URL('extension-browser.html', window.location.href).toString();
        const browserWindow = window.open(
            browserUrl,
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
        if (item.extensionId === 'gallery_browser') {
            this.handleOpenBrowser();
            this.props.onRequestClose();
            return;
        }
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
        const library = [];
        // Scratch defaults
        library.push(...extensionLibraryContent.map(toLibraryItem));
        library.push('---');
        
        // Saved extensions (all user-loaded custom/extensions)
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
        
        // TurboWarp/gallery extensions
        if (this.state.gallery) {
            // Don't add "More" link in our modified version, browser has its own
            const locale = this.props.intl.locale;
            library.push(
                ...this.state.gallery
                    .filter(i => i.extensionId !== 'faceSensing')
                    .map(i => translateGalleryItem(i, locale))
                    .map(toLibraryItem)
            );
        } else if (this.state.galleryError) {
            // Offline - just skip gallery
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
