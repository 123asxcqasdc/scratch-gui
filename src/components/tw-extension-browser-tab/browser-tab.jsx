import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';

import log from '../../lib/log';
import {saveExtension} from '../../lib/tw-saved-extensions';
import Spinner from '../spinner/spinner.jsx';
import extensionIcon from '../action-menu/icon--sprite.svg';

import styles from './browser-tab.css';

const GALLERY_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/extensions.json';

let galleryCache = null;
let galleryRequest = null;

const fetchGallery = () => {
    if (galleryCache) {
        return Promise.resolve(galleryCache);
    }
    if (!galleryRequest) {
        galleryRequest = fetch(GALLERY_URL)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                galleryCache = data;
                galleryRequest = null;
                return data;
            })
            .catch(error => {
                galleryRequest = null;
                throw error;
            });
    }
    return galleryRequest;
};

const getVariantImage = (extension, variant) => (
    variant.image || extension.image || extensionIcon
);

const getExtensionVariants = (extension, source) => (
    (extension.variants || []).filter(variant => (
        variant.url && (source === 'all' || variant.source === source)
    ))
);

class ExtensionBrowserTab extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            data: galleryCache,
            loading: !galleryCache,
            error: null,
            source: 'all',
            category: 'all',
            modal: null,
            importing: null,
            imported: [],
            message: null
        };
        this.mounted = false;

        this.handleSourceChange = this.handleSourceChange.bind(this);
        this.handleCategoryButtonClick = this.handleCategoryButtonClick.bind(this);
        this.handleCardClick = this.handleCardClick.bind(this);
        this.handleVariantClick = this.handleVariantClick.bind(this);
        this.handleImport = this.handleImport.bind(this);
        this.handleCloseModal = this.handleCloseModal.bind(this);
        this.handleStopPropagation = this.handleStopPropagation.bind(this);
    }
    componentDidMount () {
        this.mounted = true;
        if (!this.state.data) {
            fetchGallery()
                .then(data => {
                    if (this.mounted) {
                        this.setState({
                            data,
                            loading: false,
                            error: null
                        });
                    }
                })
                .catch(error => {
                    log.error(error);
                    if (this.mounted) {
                        this.setState({
                            loading: false,
                            error
                        });
                    }
                });
        }
    }
    componentWillUnmount () {
        this.mounted = false;
    }
    handleSourceChange (event) {
        this.setState({
            source: event.target.value,
            message: null
        });
    }
    handleCategoryChange (category) {
        this.setState({
            category,
            message: null
        });
    }
    handleCategoryButtonClick (event) {
        this.handleCategoryChange(event.currentTarget.dataset.category);
    }
    handleCardClick (event) {
        const index = Number(event.currentTarget.dataset.index);
        const extension = this.getFilteredExtensions()[index];
        if (!extension) {
            return;
        }
        const variants = getExtensionVariants(extension, this.state.source);
        if (variants.length === 0) {
            return;
        }
        if (variants.length === 1) {
            this.handleImport(extension, variants[0]);
            return;
        }
        this.setState({
            modal: {
                extension,
                variants
            },
            message: null
        });
    }
    handleCloseModal () {
        if (this.state.importing) {
            return;
        }
        this.setState({modal: null});
    }
    handleStopPropagation (event) {
        event.stopPropagation();
    }
    handleVariantClick (event) {
        const {modal} = this.state;
        if (!modal) {
            return;
        }
        const variant = modal.variants.find(item => item.url === event.currentTarget.dataset.url);
        if (variant) {
            this.handleImport(modal.extension, variant);
        }
    }
    findLoadedId (url) {
        const loadedExtensions = this.props.vm.extensionManager.loadedExtensions;
        if (loadedExtensions && typeof loadedExtensions.entries === 'function') {
            for (const [id, loadedURL] of loadedExtensions.entries()) {
                if (loadedURL === url) {
                    return id;
                }
            }
        }
        return null;
    }
    handleImport (extension, variant) {
        if (this.state.importing) {
            return;
        }
        const knownId = variant.ext_id || this.findLoadedId(variant.url);
        if (knownId && this.props.vm.extensionManager.isExtensionLoaded(knownId)) {
            this.props.onCategorySelected(knownId);
            return;
        }

        this.setState({
            importing: variant.url,
            message: null
        });

        this.props.vm.extensionManager.loadExtensionURL(variant.url)
            .then(() => {
                if (!this.mounted) {
                    return;
                }
                try {
                    saveExtension({
                        name: extension.name,
                        url: variant.url,
                        type: 'gallery',
                        tags: ['gallery', 'saved'],
                        iconURL: getVariantImage(extension, variant)
                    });
                } catch (error) {
                    // Ignore storage errors.
                }
                this.setState(state => ({
                    importing: null,
                    modal: null,
                    imported: state.imported.includes(variant.url) ? state.imported : (
                        [...state.imported, variant.url]
                    ),
                    message: {
                        type: 'success',
                        text: `Расширение «${extension.name}» добавлено`
                    }
                }));
                if (this.props.onImported) {
                    this.props.onImported();
                }
            })
            .catch(error => {
                log.error(error);
                if (!this.mounted) {
                    return;
                }
                this.setState({
                    importing: null,
                    message: {
                        type: 'error',
                        text: `Не удалось загрузить расширение: ${error && error.message ? error.message : error}`
                    }
                });
            });
    }
    getSources () {
        const sources = new Map();
        for (const extension of this.state.data.extensions) {
            for (const variant of extension.variants || []) {
                if (variant.url && !sources.has(variant.source)) {
                    sources.set(variant.source, {
                        id: variant.source,
                        label: variant.source_label || variant.source,
                        emoji: variant.source_emoji || ''
                    });
                }
            }
        }
        return Array.from(sources.values());
    }
    getFilteredExtensions () {
        const data = this.state.data;
        if (!data) {
            return [];
        }
        const query = (this.props.filterQuery || '').trim().toLowerCase();
        return data.extensions.filter(extension => {
            if (this.state.category !== 'all' &&
                !(extension.categories || []).includes(this.state.category)) {
                return false;
            }
            if (this.state.source !== 'all' &&
                getExtensionVariants(extension, this.state.source).length === 0) {
                return false;
            }
            if (query) {
                const search = [
                    extension.name,
                    extension.description,
                    extension.author,
                    ...(extension.categories || []),
                    ...(extension.variants || []).map(variant => variant.source_label)
                ].filter(Boolean)
                    .join('\n')
                    .toLowerCase();
                if (!search.includes(query)) {
                    return false;
                }
            }
            return true;
        });
    }
    renderCard (extension, index) {
        const variants = getExtensionVariants(extension, this.state.source);
        const variant = variants.find(item => !item.deprecated) || variants[0];
        const imported = variants.some(item => this.state.imported.includes(item.url));
        return (
            <button
                className={styles.card}
                data-index={index}
                key={`${extension.name}-${variant.url}`}
                title={extension.description || extension.name}
                type="button"
                onClick={this.handleCardClick}
            >
                <img
                    className={styles.cardImage}
                    draggable={false}
                    src={getVariantImage(extension, variant)}
                    alt=""
                />
                <div className={styles.cardName}>{extension.name}</div>
                <div className={styles.cardMeta}>
                    {variants.length > 1 ? `${variants.length} источника` : (
                        variant.source_label || extension.author || ''
                    )}
                </div>
                {imported && <div className={styles.cardImported}>Добавлено</div>}
            </button>
        );
    }
    renderSourceModal () {
        const {modal, importing} = this.state;
        if (!modal) {
            return null;
        }
        return (
            <div
                className={styles.modalOverlay}
                role="presentation"
                onMouseDown={this.handleCloseModal}
            >
                <div
                    aria-modal
                    className={styles.modal}
                    role="dialog"
                    onMouseDown={this.handleStopPropagation}
                >
                    <div className={styles.modalHeader}>
                        <div className={styles.modalTitle}>
                            {modal.extension.name}
                        </div>
                        <button
                            className={styles.modalClose}
                            type="button"
                            onClick={this.handleCloseModal}
                        >
                            ×
                        </button>
                    </div>
                    <div className={styles.modalHint}>
                        Выберите источник расширения
                    </div>
                    <div className={styles.modalBody}>
                        {modal.variants.map(variant => (
                            <button
                                className={styles.variant}
                                data-url={variant.url}
                                disabled={!!importing}
                                key={variant.url}
                                type="button"
                                onClick={this.handleVariantClick}
                            >
                                <div className={styles.variantHeader}>
                                    <span className={styles.variantSource}>
                                        {variant.source_emoji} {variant.source_label || variant.source}
                                    </span>
                                    {variant.deprecated && (
                                        <span className={styles.variantDeprecated}>устарело</span>
                                    )}
                                </div>
                                {variant.description && (
                                    <div className={styles.variantDescription}>
                                        {variant.description}
                                    </div>
                                )}
                                <div className={styles.variantAction}>
                                    {importing === variant.url ? 'Импортируем…' : 'Импортировать'}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    renderContent () {
        const {loading, error} = this.state;
        if (loading) {
            return (
                <div className={styles.centered}>
                    <Spinner
                        large
                        level="primary"
                    />
                </div>
            );
        }
        if (error) {
            return (
                <div className={styles.centered}>
                    <div className={styles.error}>
                        Не удалось загрузить каталог расширений.
                        <br />
                        {error.message || String(error)}
                    </div>
                </div>
            );
        }
        const extensions = this.getFilteredExtensions();
        if (extensions.length === 0) {
            return (
                <div className={styles.centered}>
                    <div className={styles.empty}>Ничего не найдено</div>
                </div>
            );
        }
        return (
            <div className={styles.grid}>
                {extensions.map((extension, index) => this.renderCard(extension, index))}
            </div>
        );
    }
    render () {
        const {data, source, category, message} = this.state;
        const sources = data ? this.getSources() : [];
        const categories = data ? (data.categories || []) : [];
        const count = data ? this.getFilteredExtensions().length : 0;
        return (
            <div className={styles.browser}>
                <div className={styles.toolbar}>
                    <label
                        className={styles.toolbarLabel}
                        htmlFor="uliblock-extension-source"
                    >
                        Источник
                    </label>
                    <select
                        className={styles.sourceSelect}
                        id="uliblock-extension-source"
                        value={source}
                        onChange={this.handleSourceChange}
                    >
                        <option value="all">Все источники</option>
                        {sources.map(item => (
                            <option
                                key={item.id}
                                value={item.id}
                            >
                                {item.emoji} {item.label}
                            </option>
                        ))}
                    </select>
                    <span className={styles.counter}>{count} расширений</span>
                    {message && (
                        <span
                            className={message.type === 'error' ? (
                                styles.messageError
                            ) : (
                                styles.messageSuccess
                            )}
                        >
                            {message.text}
                        </span>
                    )}
                </div>
                <div className={styles.main}>
                    <div className={styles.gridWrapper}>
                        {this.renderContent()}
                    </div>
                    <aside className={styles.sidebar}>
                        <div className={styles.sidebarTitle}>Категории</div>
                        <button
                            className={category === 'all' ? styles.categoryActive : styles.category}
                            data-category="all"
                            type="button"
                            onClick={this.handleCategoryButtonClick}
                        >
                            Все категории
                        </button>
                        {categories.map(item => (
                            <button
                                className={category === item ? styles.categoryActive : styles.category}
                                data-category={item}
                                key={item}
                                type="button"
                                onClick={this.handleCategoryButtonClick}
                            >
                                {item}
                            </button>
                        ))}
                    </aside>
                </div>
                {this.renderSourceModal()}
            </div>
        );
    }
}

ExtensionBrowserTab.propTypes = {
    filterQuery: PropTypes.string,
    onCategorySelected: PropTypes.func,
    onImported: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

ExtensionBrowserTab.defaultProps = {
    filterQuery: ''
};

export default ExtensionBrowserTab;
