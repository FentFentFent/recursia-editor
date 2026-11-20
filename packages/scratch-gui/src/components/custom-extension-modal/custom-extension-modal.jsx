import classNames from 'classnames';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useRef, useState} from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import styles from './custom-extension-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Custom Extension',
        description: 'Title for the modal where you add your own extension',
        id: 'gui.customExtensionModal.title'
    },
    intro: {
        defaultMessage: 'Add an extension that is not in the library.',
        description: 'Explains what the custom extension modal does',
        id: 'gui.customExtensionModal.intro'
    },
    fileTab: {
        defaultMessage: 'File',
        description: 'Tab for loading a custom extension from a file',
        id: 'gui.customExtensionModal.fileTab'
    },
    sourceTab: {
        defaultMessage: 'Source',
        description: 'Tab for loading a custom extension from JavaScript source',
        id: 'gui.customExtensionModal.sourceTab'
    },
    urlTab: {
        defaultMessage: 'URL',
        description: 'Tab for loading a custom extension from a URL',
        id: 'gui.customExtensionModal.urlTab'
    },
    sourcePlaceholder: {
        defaultMessage: 'Paste the extension\'s JavaScript source here.',
        description: 'Placeholder for the custom extension JavaScript source field',
        id: 'gui.customExtensionModal.sourcePlaceholder'
    },
    urlPlaceholder: {
        defaultMessage: 'https://example.com/extension.js',
        description: 'Placeholder for the custom extension URL field',
        id: 'gui.customExtensionModal.urlPlaceholder'
    }
});

const TABS = [
    {id: 'file', label: messages.fileTab},
    {id: 'source', label: messages.sourceTab},
    {id: 'url', label: messages.urlTab}
];

const CustomExtensionModal = props => {
    const intl = useIntl();
    const [activeTab, setActiveTab] = useState(TABS[0].id);
    const fileInput = useRef(null);
    const sourceInput = useRef(null);
    const urlInput = useRef(null);

    const tabId = tab => `customExtensionModal-tab-${tab}`;
    const panelId = tab => `customExtensionModal-panel-${tab}`;
    console.log(props);
    const handleLoad = async () => {
        if (activeTab === 'file') {
            const file = fileInput.current.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onloadend = (ev) => {
                const text = reader.result;
                props.vm.extensionManager.loadExtensionSource(text);

                props.onClose();
            }
            reader.readAsText(file);

        } else if (activeTab === 'source') {
            props.vm.extensionManager.loadExtensionSource(sourceInput.current.value);
            props.onClose();
        } else {
            const source = await (await fetch(urlInput.current.value)).text();
            props.vm.extensionManager.loadExtensionSource(source);
            props.onClose();
        }
    };

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            id="customExtension"
            onRequestClose={props.onClose}
        >
            <Box className={styles.body}>
                <FormattedMessage {...messages.intro} />
                <div
                    className={styles.tabs}
                    role="tablist"
                >
                    {TABS.map(tab => (
                        <button
                            aria-controls={panelId(tab.id)}
                            aria-selected={activeTab === tab.id}
                            className={classNames(styles.tab, {
                                [styles.activeTab]: activeTab === tab.id
                            })}
                            id={tabId(tab.id)}
                            key={tab.id}
                            role="tab"
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <FormattedMessage {...tab.label} />
                        </button>
                    ))}
                </div>
                {/* Panels stay mounted so input typed in one tab survives a switch. */}
                <div
                    aria-labelledby={tabId('file')}
                    className={styles.tabPanel}
                    hidden={activeTab !== 'file'}
                    id={panelId('file')}
                    role="tabpanel"
                >
                    <input
                        className={styles.fileInput}
                        ref={fileInput}
                        type="file"
                    />
                </div>
                <div
                    aria-labelledby={tabId('source')}
                    className={styles.tabPanel}
                    hidden={activeTab !== 'source'}
                    id={panelId('source')}
                    role="tabpanel"
                >
                    <textarea
                        className={styles.textArea}
                        placeholder={intl.formatMessage(messages.sourcePlaceholder)}
                        ref={sourceInput}
                        spellCheck={false}
                    />
                </div>
                <div
                    aria-labelledby={tabId('url')}
                    className={styles.tabPanel}
                    hidden={activeTab !== 'url'}
                    id={panelId('url')}
                    role="tabpanel"
                >
                    <input
                        className={styles.textInput}
                        placeholder={intl.formatMessage(messages.urlPlaceholder)}
                        ref={urlInput}
                        type="text"
                    />
                </div>
            </Box>
            <Box className={styles.buttonRow}>
                <button
                    className={styles.button}
                    type="button"
                    onClick={props.onClose}
                >
                    <FormattedMessage
                        defaultMessage="Cancel"
                        description="Button to close the custom extension modal"
                        id="gui.customExtensionModal.cancel"
                    />
                </button>
                <button
                    className={styles.loadButton}
                    type="button"
                    onClick={handleLoad}
                >
                    <FormattedMessage
                        defaultMessage="Load"
                        description="Button to add the custom extension"
                        id="gui.customExtensionModal.load"
                    />
                </button>
            </Box>
        </Modal>
    );
};

CustomExtensionModal.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default CustomExtensionModal;
