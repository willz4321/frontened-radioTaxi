package com.axiomarobotics.plugins.notification.src.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MyBroadcastReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // Aquí puedes manejar cualquier acción que necesites al reiniciar el dispositivo
        }
    }
}