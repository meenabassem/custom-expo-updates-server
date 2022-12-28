import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View, Image} from 'react-native';
import Constants from 'expo-constants';

export default function App() {
    return (
        <View style={styles.container}>
            <Text>1113131313 up App.js to 444 on your ****4455****** 3333</Text>
            <Text>{Constants.expoConfig.name}</Text>
            <Image source={require('./assets/favicon.png')}
                   style={{width: 100, height: 100}}
            />
            <Image source={require('./assets/splash.png')}
                   style={{width: 100, height: 100}}
            />
            <StatusBar style="auto"/>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
