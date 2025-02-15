import { getED25519KeyPair } from '@mixin.dev/mixin-node-sdk';
import { toRefs, reactive, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  useLoadStore,
  useConfirmModalStore,
  useSecretModalStore,
  useUpdateTokenModalStore,
} from '@/stores';
import { ls, randomPin } from '@/utils';
import { useUserClient, useBotClient } from '@/api';

export default {
  name: 'app-secret',
  props: {
    appId: String,
  },
  setup(props) {
    const $message = inject('$message');
    const { t } = useI18n();

    const { modifyLocalLoadingStatus } = useLoadStore();
    const { useInitConfirm } = useConfirmModalStore();
    const { useInitSecret } = useSecretModalStore();
    const { useInitUpdateToken } = useUpdateTokenModalStore();

    const state = reactive({
      submitting: false,
    });

    const userClient = useUserClient($message, t);
    const useCheckKeystore = (keystore) => keystore && keystore.user_id && keystore.pin_token && keystore.private_key && keystore.session_id;

    const useUpdateSecret = async () => {
      if (state.submitting) {
        $message.error({ message: t('message.errors.reset'), showClose: true });
        return;
      }

      modifyLocalLoadingStatus(true);
      state.submitting = true;
      const res = await userClient.app.updateSecret(props.appId);
      state.submitting = false;
      modifyLocalLoadingStatus(false);

      if (res && res.app_secret) {
        $message.success({ message: t('message.success.reset'), showClose: true });
        useInitSecret(t('secret.secret_title'), res.app_secret, 'UpdateSecret');
      }
    };
    const useUpdateSession = async () => {
      if (state.submitting) {
        $message.error({ message: t('message.errors.reset'), showClose: true });
        return;
      }

      state.submitting = true;
      modifyLocalLoadingStatus(true);
      const pin = randomPin();
      const { publicKey: session_secret, privateKey } = getED25519KeyPair();
      const res = await userClient.app.updateSession(props.appId, pin, session_secret);
      state.submitting = false;
      modifyLocalLoadingStatus(false);

      if (res && res.session_id && res.pin_token_base64) {
        $message.success({ message: t('message.success.reset'), showClose: true });
        ls.rm(props.appId);

        const session = JSON.stringify({
          pin,
          client_id: props.appId,
          session_id: res.session_id,
          pin_token: res.pin_token_base64,
          private_key: privateKey,
        }, null, 2);
        useInitSecret(t('secret.session_title'), session, 'UpdateSession');
      }
    };
    const useRotateCode = async () => {
      const clientInfo = ls.get(props.appId);
      if (!useCheckKeystore(clientInfo)) {
        useInitUpdateToken(props.appId, () => {
          useRotateCode();
        });
        return;
      }

      if (state.submitting) {
        $message.error({ message: t('message.errors.reset'), showClose: true });
        return;
      }

      const appClient = useBotClient($message, t, clientInfo);

      modifyLocalLoadingStatus(true);
      state.submitting = true;
      const res = await appClient.user.rotateCode();
      state.submitting = false;
      modifyLocalLoadingStatus(false);

      if (!res.code_url) return;
      useInitSecret(t('secret.qrcode_title'), res.code_url, '');
    };

    const useDoubleCheck = async (type) => {
      switch (type) {
        case 'RotateQRCode':
          useInitConfirm(
            t('secret.rotate_qrcode_question'),
            useRotateCode,
          );
          break;
        case 'UpdateSecret':
          useInitConfirm(
            t('secret.secret_question'),
            useUpdateSecret,
          );
          break;
        case 'UpdateSession':
          useInitConfirm(
            t('secret.session_question'),
            useUpdateSession,
          );
          break;
        default:
          break;
      }
    };
    const useShowCodeUrl = async () => {
      modifyLocalLoadingStatus(true);
      state.submitting = true;
      const user = await userClient.user.fetch(props.appId);
      state.submitting = false;
      modifyLocalLoadingStatus(false);

      if (!user.code_url) return;
      useInitSecret(t('secret.qrcode_title'), user.code_url, '');
    }

    return {
      ...toRefs(state),
      useDoubleCheck,
      useShowCodeUrl,
      t,
    };
  },
};
