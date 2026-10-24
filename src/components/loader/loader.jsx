import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import snailSvg from './snail.svg';
import {getIsLoadingWithId} from '../../reducers/project-state';

const mainMessages = {
    'gui.loader.headline': (
        <FormattedMessage
            defaultMessage="Loading Project"
            description="Main loading message"
            id="gui.loader.headline"
        />
    ),
    'gui.loader.creating': (
        <FormattedMessage
            defaultMessage="Creating Project"
            description="Main creating message"
            id="gui.loader.creating"
        />
    )
};

const messages = defineMessages({
    projectData: {
        defaultMessage: 'Loading project …',
        description: 'Appears when loading project data, but not assets yet',
        id: 'tw.loader.projectData'
    },
    downloadingAssets: {
        defaultMessage: 'Downloading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project on a remote website',
        id: 'tw.loader.downloadingAssets'
    },
    loadingAssets: {
        defaultMessage: 'Loading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project file on the user\'s computer',
        id: 'tw.loader.loadingAssets'
    }
});

class LoaderComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAssetProgress',
            'handleProjectLoaded',
            'barInnerRef',
            'messageRef',
            'snailRef',
            'trackRef'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.snailEl = null;
        this.trackEl = null;
        this.ignoreProgress = false;
        this.finished = false;
    }
    _attachVM (vm) {
        if (!vm || !vm.runtime) return;
        if (this._attachedVM === vm) return;
        if (this._attachedVM) {
            try { this._attachedVM.off('ASSET_PROGRESS', this.handleAssetProgress); } catch (e) {}
            try { this._attachedVM.runtime.off('PROJECT_LOADED', this.handleProjectLoaded); } catch (e) {}
        }
        this._attachedVM = vm;
        try {
            vm.on('ASSET_PROGRESS', this.handleAssetProgress);
            vm.runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
            this.handleAssetProgress(
                vm.runtime.finishedAssetRequests,
                vm.runtime.totalAssetRequests
            );
        } catch (e) {}
    }
    componentDidMount () {
        try {
            this._attachVM(this.props.vm);
        } catch (e) {}
        if (!this._attachedVM && typeof window !== 'undefined') {
            if (window.vm) this._attachVM(window.vm);
            else if (window.Scratch && window.Scratch.vm) this._attachVM(window.Scratch.vm);
            else if (window.scaffolding && window.scaffolding.vm) this._attachVM(window.scaffolding.vm);
        }
        this._vmCheckInterval = setInterval(() => {
            if (this._attachedVM && this._attachedVM.runtime) {
                clearInterval(this._vmCheckInterval);
                this._vmCheckInterval = null;
                return;
            }
            if (typeof window !== 'undefined') {
                if (window.vm) this._attachVM(window.vm);
                else if (window.Scratch && window.Scratch.vm) this._attachVM(window.Scratch.vm);
                else if (window.scaffolding && window.scaffolding.vm) this._attachVM(window.scaffolding.vm);
            }
            if (!this._attachedVM && this.props.vm) {
                this._attachVM(this.props.vm);
            }
        }, 50);
        setTimeout(() => {
            if (this._vmCheckInterval) {
                clearInterval(this._vmCheckInterval);
                this._vmCheckInterval = null;
            }
        }, 15000);

        this._progressPoll = setInterval(() => {
            if (this.ignoreProgress || this.finished) return;
            const vm = this._attachedVM || this.props.vm;
            if (!vm || !vm.runtime) return;
            try {
                const finished = vm.runtime.finishedAssetRequests || 0;
                const total = vm.runtime.totalAssetRequests || 0;
                if (typeof finished === 'number' && typeof total === 'number') {
                    this.handleAssetProgress(finished, total);
                }
            } catch (e) {}
        }, 50);
    }
    componentWillUnmount () {
        if (this._vmCheckInterval) {
            clearInterval(this._vmCheckInterval);
            this._vmCheckInterval = null;
        }
        if (this._progressPoll) {
            clearInterval(this._progressPoll);
            this._progressPoll = null;
        }
        if (this._attachedVM) {
            try { this._attachedVM.off('ASSET_PROGRESS', this.handleAssetProgress); } catch (e) {}
            try { this._attachedVM.runtime.off('PROJECT_LOADED', this.handleProjectLoaded); } catch (e) {}
            this._attachedVM = null;
        }
        if (this.props.vm) {
            try { this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress); } catch (e) {}
            try { this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded); } catch (e) {}
        }
    }
    updateSnailPosition (progress) {
        if (!this.snailEl || !this.trackEl) {
            return;
        }
        const clamped = Math.max(0, Math.min(1, progress));
        const trackWidth = this.trackEl.clientWidth || 420;
        const offset = clamped * (trackWidth - 70);
        this.snailEl.style.left = `${offset}px`;
    }
    handleAssetProgress (finished, total) {
        if (this.ignoreProgress || !this.messageEl) {
            return;
        }

        if (this.barInnerEl) {
            this.barInnerEl.style.width = total === 0 ? '0' : `${finished / total * 100}%`;
        }

        if (total === 0) {
            this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
            this.updateSnailPosition(0);
            if (this.snailEl) {
                this.snailEl.classList.remove(styles.snailDropping);
                this.snailEl.classList.remove(styles.snailCrawling);
                this.snailEl.classList.add(styles.snailFalling);
            }
        } else {
            const progress = finished / total;
            this.updateSnailPosition(progress);
            if (this.snailEl) {
                this.snailEl.classList.remove(styles.snailFalling);
                this.snailEl.classList.remove(styles.snailDropping);
                this.snailEl.classList.add(styles.snailCrawling);
            }
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            this.messageEl.textContent = this.props.intl.formatMessage(message, {
                complete: finished,
                total
            });
        }
    }
    handleProjectLoaded () {
        if (this.ignoreProgress || !this.messageEl) {
            return;
        }

        this.ignoreProgress = true;
        this.finished = true;
        if (this.barInnerEl) {
            this.barInnerEl.style.width = '100%';
        }
        if (this.snailEl && this.trackEl) {
            this.snailEl.classList.remove(styles.snailFalling);
            this.snailEl.classList.remove(styles.snailCrawling);
            this.updateSnailPosition(1);
            void this.snailEl.offsetWidth;
            this.snailEl.classList.add(styles.snailDropping);
        }
        if (this.props.vm && this.props.vm.runtime && this.props.vm.runtime.resetProgress) {
            this.props.vm.runtime.resetProgress();
        }
    }
    barInnerRef (barInner) {
        this.barInnerEl = barInner;
    }
    messageRef (message) {
        this.messageEl = message;
    }
    snailRef (snail) {
        this.snailEl = snail;
    }
    trackRef (track) {
        this.trackEl = track;
    }
    render () {
        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                })}
            >
                <div className={styles.container}>
                    <div
                        className={styles.snailStage}
                        aria-hidden="true"
                    >
                        <img
                            src={snailSvg}
                            className={classNames(styles.snail, styles.snailFalling)}
                            ref={this.snailRef}
                            alt=""
                        />
                        <div
                            className={styles.snailTrack}
                            ref={this.trackRef}
                        />
                    </div>

                    <div className={styles.title}>
                        {mainMessages[this.props.messageId]}
                    </div>

                    <div
                        className={styles.message}
                        ref={this.messageRef}
                    />
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
    vm: PropTypes.shape({
        on: PropTypes.func,
        off: PropTypes.func,
        runtime: PropTypes.shape({
            totalAssetRequests: PropTypes.number,
            finishedAssetRequests: PropTypes.number,
            resetProgress: PropTypes.func,
            on: PropTypes.func,
            off: PropTypes.func
        })
    })
};
LoaderComponent.defaultProps = {
    isFullScreen: false,
    messageId: 'gui.loader.headline'
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
